import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';

export interface AuditEntry {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;        // e.g. AUTH_LOGIN, SOS_TRIGGER, ADMIN_BAN_USER
  entity: string;        // e.g. User, Alert, Report
  entityId?: string | null;
  method?: string;
  path?: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  // Never throws: an audit failure must not break the request.
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          actorRole: entry.actorRole ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          method: entry.method,
          path: entry.path,
          statusCode: entry.statusCode,
          metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent?.slice(0, 500) ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Audit write failed: ${(err as Error).message}`);
    }
  }
}
