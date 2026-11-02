import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AlertStatus, CheckInStatus, ReportStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { AuditService } from '../../infra/audit/audit.service.js';

type Actor = { id: string; role: UserRole };

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // ---------- Reports ----------

  async flaggedReports(limit = 50) {
    return this.prisma.report.findMany({
      where: { status: ReportStatus.FLAGGED, deletedAt: null },
      orderBy: { flagCount: 'desc' },
      take: limit,
      include: {
        author: { select: { id: true, fullName: true, phoneNumber: true } },
        flags: { select: { userId: true, reason: true, createdAt: true } },
      },
    });
  }

  async pendingReports(limit = 50) {
    return this.prisma.report.findMany({
      where: { status: ReportStatus.PENDING, deletedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: { author: { select: { id: true, fullName: true } } },
    });
  }

  async approveReport(actor: Actor, reportId: string) {
    const report = await this.getReport(reportId);
    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.VERIFIED },
    });
    await this.audit.log({
      actorId: actor.id, actorRole: actor.role, action: 'ADMIN_REPORT_APPROVE',
      entity: 'Report', entityId: reportId, metadata: { from: report.status },
    });
    return { success: true, reportId, status: updated.status };
  }

  async rejectReport(actor: Actor, reportId: string, reason: string) {
    const report = await this.getReport(reportId);
    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.REJECTED },
    });
    await this.audit.log({
      actorId: actor.id, actorRole: actor.role, action: 'ADMIN_REPORT_REJECT',
      entity: 'Report', entityId: reportId, metadata: { from: report.status, reason },
    });
    return { success: true, reportId, status: updated.status };
  }

  // ---------- Users ----------

  async searchUsers(q?: string, limit = 50) {
    const where = q
      ? { OR: [{ fullName: { contains: q, mode: 'insensitive' as const } }, { phoneNumber: { contains: q } }] }
      : {};
    return this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, fullName: true, phoneNumber: true, role: true,
        isActive: true, isBanned: true, bannedAt: true, banReason: true, createdAt: true,
        _count: { select: { alerts: true, reports: true, reportFlags: true } },
      },
    });
  }

  async banUser(actor: Actor, userId: string, reason: string) {
    if (userId === actor.id) throw new BadRequestException('You cannot ban yourself');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === UserRole.ADMIN) throw new BadRequestException('Cannot ban another admin');
    if (user.isBanned) throw new BadRequestException('User is already banned');

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { isBanned: true, bannedAt: now, banReason: reason, fcmToken: null },
      }),
      // Close anything that would keep notifying contacts on a banned account
      this.prisma.alert.updateMany({
        where: { creatorId: userId, status: AlertStatus.ACTIVE },
        data: { status: AlertStatus.CANCELLED, cancelledAt: now },
      }),
      this.prisma.checkIn.updateMany({
        where: { userId, status: CheckInStatus.PENDING },
        data: { status: CheckInStatus.CANCELLED, cancelledAt: now },
      }),
      // Hide their unverified reports from the map
      this.prisma.report.updateMany({
        where: { authorId: userId, status: ReportStatus.PENDING },
        data: { status: ReportStatus.REJECTED },
      }),
    ]);

    await this.audit.log({
      actorId: actor.id, actorRole: actor.role, action: 'ADMIN_USER_BAN',
      entity: 'User', entityId: userId, metadata: { reason },
    });
    this.logger.warn(`[ADMIN] ${actor.id} banned ${userId}: ${reason}`);
    return { success: true, userId, isBanned: true };
  }

  async unbanUser(actor: Actor, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.isBanned) throw new BadRequestException('User is not banned');

    await this.prisma.user.update({
      where: { id: userId },
      data: { isBanned: false, bannedAt: null, banReason: null },
    });
    await this.audit.log({
      actorId: actor.id, actorRole: actor.role, action: 'ADMIN_USER_UNBAN',
      entity: 'User', entityId: userId,
    });
    return { success: true, userId, isBanned: false };
  }

  // ---------- Audit + stats ----------

  async auditLogs(q: { action?: string; actorId?: string; entityId?: string; limit?: number }) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(q.action ? { action: { contains: q.action.toUpperCase() } } : {}),
        ...(q.actorId ? { actorId: q.actorId } : {}),
        ...(q.entityId ? { entityId: q.entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: q.limit ?? 100,
    });
  }

  async stats() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [users, banned, activeAlerts, alerts24h, pendingCheckIns, flagged, pending, verified] =
      await Promise.all([
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.user.count({ where: { isBanned: true } }),
        this.prisma.alert.count({ where: { status: AlertStatus.ACTIVE } }),
        this.prisma.alert.count({ where: { createdAt: { gte: since24h } } }),
        this.prisma.checkIn.count({ where: { status: CheckInStatus.PENDING } }),
        this.prisma.report.count({ where: { status: ReportStatus.FLAGGED, deletedAt: null } }),
        this.prisma.report.count({ where: { status: ReportStatus.PENDING, deletedAt: null } }),
        this.prisma.report.count({ where: { status: ReportStatus.VERIFIED, deletedAt: null } }),
      ]);
    return {
      users: { active: users, banned },
      alerts: { active: activeAlerts, last24h: alerts24h },
      checkIns: { pending: pendingCheckIns },
      reports: { flagged, pending, verified },
      generatedAt: new Date(),
    };
  }

  private async getReport(reportId: string) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report || report.deletedAt) throw new NotFoundException('Report not found');
    return report;
  }
}
