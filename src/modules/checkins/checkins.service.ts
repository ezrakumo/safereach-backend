import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AlertStatus, AlertType, CheckInStatus, NotifyVia, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { CreateCheckInDto } from './dto/create-checkin.dto.js';

type MissedCheckIn = Prisma.CheckInGetPayload<{
  include: { user: { include: { contacts: true } } };
}>;

@Injectable()
export class CheckinsService {
  private readonly logger = new Logger(CheckinsService.name);
  private sweeping = false;

  constructor(private prisma: PrismaService) {}

  async createCheckIn(userId: string, dto: CreateCheckInDto) {
    const expectedAt = new Date(dto.expectedAt);
    if (Number.isNaN(expectedAt.getTime())) {
      throw new BadRequestException('expectedAt must be a valid date');
    }
    if (expectedAt.getTime() <= Date.now()) {
      throw new BadRequestException('expectedAt must be in the future');
    }

    const pending = await this.prisma.checkIn.count({
      where: { userId, status: CheckInStatus.PENDING },
    });
    if (pending >= 3) {
      throw new BadRequestException('You already have 3 pending check-ins');
    }

    const graceMinutes = dto.graceMinutes ?? 10;
    const deadlineAt = new Date(expectedAt.getTime() + graceMinutes * 60 * 1000);

    const checkIn = await this.prisma.checkIn.create({
      data: {
        userId,
        title: dto.title?.trim() || 'Safety Check-in',
        note: dto.note?.trim(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        expectedAt,
        graceMinutes,
        deadlineAt,
      },
    });

    this.logger.log(
      `[CHECK-IN] ${checkIn.id} created. Deadline: ${deadlineAt.toISOString()}`,
    );
    return checkIn;
  }

  async markSafe(userId: string, checkInId: string) {
    const ci = await this.getOwned(userId, checkInId);
    if (ci.status === CheckInStatus.SAFE || ci.status === CheckInStatus.CANCELLED) {
      throw new BadRequestException(`Check-in is already ${ci.status.toLowerCase()}`);
    }

    const now = new Date();
    const updated = await this.prisma.checkIn.update({
      where: { id: ci.id },
      data: { status: CheckInStatus.SAFE, checkedInAt: now },
    });

    // If it was already missed, the user is late but OK: resolve the linked alert
    if (updated.alertId) {
      const result = await this.prisma.alert.updateMany({
        where: { id: updated.alertId, status: AlertStatus.ACTIVE },
        data: { status: AlertStatus.RESOLVED, resolvedAt: now },
      });
      if (result.count > 0) {
        this.logger.warn(
          `[CHECK-IN] ${ci.id} marked safe AFTER being missed. Linked alert ${updated.alertId} resolved (all clear).`,
        );
      }
    } else {
      this.logger.log(`[CHECK-IN] ${ci.id} marked safe on time.`);
    }

    return updated;
  }

  async cancelCheckIn(userId: string, checkInId: string) {
    const ci = await this.getOwned(userId, checkInId);
    if (ci.status !== CheckInStatus.PENDING) {
      throw new BadRequestException(
        `Only pending check-ins can be cancelled (this one is ${ci.status.toLowerCase()})`,
      );
    }
    return this.prisma.checkIn.update({
      where: { id: ci.id },
      data: { status: CheckInStatus.CANCELLED, cancelledAt: new Date() },
    });
  }

  async getPending(userId: string) {
    return this.prisma.checkIn.findMany({
      where: { userId, status: CheckInStatus.PENDING },
      orderBy: { deadlineAt: 'asc' },
    });
  }

  async getMine(userId: string) {
    return this.prisma.checkIn.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getById(userId: string, checkInId: string) {
    return this.getOwned(userId, checkInId);
  }

  // Watchdog: every 30 seconds, find overdue check-ins and alert contacts
  @Cron(CronExpression.EVERY_30_SECONDS)
  async sweepMissedCheckIns() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const missed = await this.prisma.checkIn.findMany({
        where: { status: CheckInStatus.PENDING, deadlineAt: { lte: new Date() } },
        include: { user: { include: { contacts: { where: { isActive: true } } } } },
        take: 50,
      });

      for (const ci of missed) {
        try {
          await this.handleMissed(ci);
        } catch (err) {
          this.logger.error(
            `Failed to process missed check-in ${ci.id}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`Check-in sweep failed: ${(err as Error).message}`);
    } finally {
      this.sweeping = false;
    }
  }

  private async handleMissed(ci: MissedCheckIn) {
    const now = new Date();

    // Claim it first so it can never be processed twice
    const claimed = await this.prisma.checkIn.updateMany({
      where: { id: ci.id, status: CheckInStatus.PENDING },
      data: { status: CheckInStatus.MISSED, missedAt: now },
    });
    if (claimed.count === 0) return;

    const hasLocation = ci.latitude != null && ci.longitude != null;
    const mapsLink = hasLocation
      ? `https://maps.google.com/?q=${ci.latitude},${ci.longitude}`
      : null;

    const alert = await this.prisma.alert.create({
      data: {
        creatorId: ci.userId,
        type: AlertType.CHECKIN_MISSED,
        status: AlertStatus.ACTIVE,
        latitude: ci.latitude,
        longitude: ci.longitude,
        message:
          `${ci.user.fullName} missed their safety check-in "${ci.title}"` +
          (ci.note ? ` - ${ci.note}` : ''),
        expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      },
    });

    await this.prisma.checkIn.update({
      where: { id: ci.id },
      data: { alertId: alert.id },
    });

    const contacts = ci.user.contacts;
    if (contacts.length > 0) {
      await this.prisma.alertRecipient.createMany({
        data: contacts.map((c) => ({
          alertId: alert.id,
          contactName: c.fullName,
          contactPhone: c.phoneNumber,
          notifiedVia: c.notifyVia.includes(NotifyVia.SMS) ? 'SMS' : 'PUSH',
          delivered: true, // DEV: pretend delivery succeeded
          deliveredAt: now,
        })),
      });
    }

    // DEV MODE: print what would be sent (real SMS/push comes later)
    this.logger.warn(
      `[CHECK-IN MISSED] ${ci.user.fullName} (${ci.user.phoneNumber}) did not check in for "${ci.title}". Alert ${alert.id} created.`,
    );
    for (const c of contacts) {
      this.logger.warn(
        `[DEV SMS] To ${c.fullName} (${c.phoneNumber}): SAFETY ALERT: ${ci.user.fullName} missed their safety check-in "${ci.title}".` +
          (mapsLink ? ` Last known location: ${mapsLink}.` : '') +
          ' Please try to reach them.',
      );
    }
    if (contacts.length === 0) {
      this.logger.warn('[CHECK-IN MISSED] User has no emergency contacts. Nobody was notified.');
    }
  }

  private async getOwned(userId: string, checkInId: string) {
    const ci = await this.prisma.checkIn.findUnique({ where: { id: checkInId } });
    if (!ci) throw new NotFoundException('Check-in not found');
    if (ci.userId !== userId) throw new ForbiddenException('Not your check-in');
    return ci;
  }
}
