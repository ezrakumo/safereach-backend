import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AlertStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);
  private running = false;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private audit: AuditService,
  ) {}

  private num(key: string, fallback: number): number {
    const v = Number(this.config.get(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  }

  policy() {
    return {
      otpHours: this.num('RETENTION_OTP_HOURS', 24),
      trackingDays: this.num('RETENTION_TRACKING_DAYS', 30),
      auditDays: this.num('RETENTION_AUDIT_DAYS', 180),
      recipientLogDays: this.num('RETENTION_RECIPIENT_LOG_DAYS', 90),
      reportDays: this.num('REPORT_EXPIRY_DAYS', 30),
    };
  }

  // Runs daily at 03:00 server time. Also callable by admin for an immediate sweep.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async nightly() {
    if ((this.config.get('RETENTION_ENABLED') ?? 'true').toString().toLowerCase() === 'false') return;
    await this.run('cron');
  }

  async run(trigger: 'cron' | 'admin', actorId?: string) {
    if (this.running) return { skipped: true, reason: 'already running' };
    this.running = true;
    const started = Date.now();
    const p = this.policy();
    const now = Date.now();
    const ago = (ms: number) => new Date(now - ms);
    const H = 3600_000, D = 24 * H;

    try {
      const otps = await this.prisma.otp.deleteMany({
        where: { OR: [{ expiresAt: { lt: ago(p.otpHours * H) } }, { verified: true, createdAt: { lt: ago(p.otpHours * H) } }] },
      });

      // Location history is the most sensitive data we hold: purge after N days,
      // but never from an alert that is still ACTIVE.
      const tracking = await this.prisma.trackingPoint.deleteMany({
        where: {
          createdAt: { lt: ago(p.trackingDays * D) },
          alert: { status: { not: AlertStatus.ACTIVE } },
        },
      });

      // Contact phone numbers in delivery logs
      const recipients = await this.prisma.alertRecipient.deleteMany({
        where: {
          createdAt: { lt: ago(p.recipientLogDays * D) },
          alert: { status: { not: AlertStatus.ACTIVE } },
        },
      });

      // Expired community reports: soft-delete so the row count stays auditable
      const reports = await this.prisma.report.updateMany({
        where: { expiresAt: { lt: new Date() }, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      // Audit rows, except admin actions which we keep longer (2x)
      const audit = await this.prisma.auditLog.deleteMany({
        where: {
          createdAt: { lt: ago(p.auditDays * D) },
          NOT: { action: { startsWith: 'ADMIN_' } },
        },
      });
      const auditAdmin = await this.prisma.auditLog.deleteMany({
        where: { createdAt: { lt: ago(p.auditDays * 2 * D) }, action: { startsWith: 'ADMIN_' } },
      });

      const summary = {
        trigger,
        otpsDeleted: otps.count,
        trackingPointsDeleted: tracking.count,
        recipientLogsDeleted: recipients.count,
        reportsExpired: reports.count,
        auditRowsDeleted: audit.count + auditAdmin.count,
        durationMs: Date.now() - started,
        policy: p,
      };

      this.logger.log(`[RETENTION] ${JSON.stringify(summary)}`);
      await this.audit.log({
        actorId: actorId ?? null,
        actorRole: trigger === 'admin' ? 'ADMIN' : 'SYSTEM',
        action: 'RETENTION_SWEEP',
        entity: 'System',
        metadata: summary,
      });
      return summary;
    } catch (err) {
      this.logger.error(`[RETENTION] failed: ${(err as Error).message}`);
      throw err;
    } finally {
      this.running = false;
    }
  }
}
