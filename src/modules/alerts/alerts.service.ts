import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AlertStatus, AlertType, NotifyVia } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { SmsService } from '../../infra/sms/sms.service.js';
import { TriggerSosDto } from './dto/trigger-sos.dto.js';
import { CreateTrackPointDto } from './dto/create-track-point.dto.js';

const TRACKABLE_TYPES: AlertType[] = [
  AlertType.PANIC,
  AlertType.TRACKING,
  AlertType.CHECKIN_MISSED,
];

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private sms: SmsService,
  ) {}

  private baseUrl(): string {
    return (this.config.get<string>('APP_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  }

  private apiPrefix(): string {
    return (this.config.get<string>('API_PREFIX') ?? 'api/v1')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');
  }

  private publicAlertUrl(shareToken: string): string {
    return `${this.baseUrl()}/${this.apiPrefix()}/public/alerts/${shareToken}`;
  }

  async triggerSOS(userId: string, dto: TriggerSosDto) {
    const recent = await this.prisma.alert.findFirst({
      where: {
        creatorId: userId,
        type: AlertType.PANIC,
        status: AlertStatus.ACTIVE,
        createdAt: { gt: new Date(Date.now() - 30 * 1000) },
      },
      select: { id: true },
    });

    if (recent) {
      throw new BadRequestException(
        'An SOS is already active. Please wait before triggering again.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { contacts: { where: { isActive: true } } },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const alert = await this.prisma.alert.create({
      data: {
        creatorId: userId,
        type: AlertType.PANIC,
        status: AlertStatus.ACTIVE,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
        addressLandmark: dto.addressLandmark,
        isSilent: dto.isSilent ?? false,
        expiresAt,
        shareToken: crypto.randomUUID(),
      },
    });

    const mapsLink = `https://maps.google.com/?q=${dto.latitude},${dto.longitude}`;
    const shareUrl = this.publicAlertUrl(alert.shareToken!);

    if (user.contacts.length > 0) {
      await this.prisma.alertRecipient.createMany({
        data: user.contacts.map((contact) => ({
          alertId: alert.id,
          contactName: contact.fullName,
          contactPhone: contact.phoneNumber,
          notifiedVia: contact.notifyVia.includes(NotifyVia.SMS) ? 'SMS' : 'PUSH',
        })),
      });
    }

    const smsTargets = user.contacts
      .filter((contact) => contact.notifyVia.includes(NotifyVia.SMS))
      .map((contact) => contact.phoneNumber);

    const smsMessage = `SAFETY ALERT: ${user.fullName} may be in danger. Track their live location: ${shareUrl}`;

    const smsResult = await this.sms.sendToMany(smsTargets, smsMessage);

    if (smsResult.deliveredTo.length > 0) {
      await this.prisma.alertRecipient.updateMany({
        where: {
          alertId: alert.id,
          contactPhone: { in: smsResult.deliveredTo },
        },
        data: {
          delivered: true,
          deliveredAt: new Date(),
        },
      });
    }

    if (smsResult.errors.length > 0) {
      this.logger.warn(`[SOS] SMS problems: ${smsResult.errors.join('; ')}`);
    }

    this.logger.warn(`[SOS] Alert ${alert.id} created`);
    this.logger.warn(`[SOS] User: ${user.fullName} (${user.phoneNumber})`);
    this.logger.warn(`[SOS] Location: ${mapsLink}`);
    this.logger.warn(`[SOS] Share URL: ${shareUrl}`);

    if (user.contacts.length === 0) {
      this.logger.warn('[SOS] This user has no emergency contacts. Nobody was notified.');
    }

    return {
      success: true,
      alertId: alert.id,
      status: alert.status,
      expiresAt: alert.expiresAt,
      mapsLink,
      shareToken: alert.shareToken,
      shareUrl,
      contactsRecorded: user.contacts.length,
      contactsNotified: user.contacts.length,
      smsAttempted: smsResult.attempted,
      smsDelivered: smsResult.deliveredTo.length,
      smsDevMode: this.sms.isDev,
    };
  }

  async addTrackPoint(userId: string, alertId: string, dto: CreateTrackPointDto) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    if (alert.creatorId !== userId) {
      throw new ForbiddenException('Not your alert');
    }

    if (!TRACKABLE_TYPES.includes(alert.type)) {
      throw new BadRequestException('This alert type does not support live tracking');
    }

    if (alert.status !== AlertStatus.ACTIVE) {
      throw new BadRequestException(`Alert is ${alert.status.toLowerCase()}; tracking is closed`);
    }

    const point = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trackingPoint.create({
        data: {
          alertId,
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracy: dto.accuracy,
          speed: dto.speed,
          heading: dto.heading,
          battery: dto.battery,
        },
      });

      await tx.alert.update({
        where: { id: alertId },
        data: {
          latitude: dto.latitude,
          longitude: dto.longitude,
        },
      });

      return created;
    });

    const totalPoints = await this.prisma.trackingPoint.count({
      where: { alertId },
    });

    this.logger.log(`[TRACK] ${alertId} point #${totalPoints}: ${dto.latitude},${dto.longitude}`);

    return {
      success: true,
      point,
      totalPoints,
    };
  }

  async getTrack(userId: string, alertId: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    if (alert.creatorId !== userId) {
      throw new ForbiddenException('Not your alert');
    }

    const points = await this.prisma.trackingPoint.findMany({
      where: { alertId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    return {
      alertId,
      status: alert.status,
      shareUrl: alert.shareToken ? this.publicAlertUrl(alert.shareToken) : null,
      totalPoints: points.length,
      latest: points.length > 0 ? points[points.length - 1] : null,
      points,
    };
  }

  async getPublicTrack(shareToken: string) {
    if (!shareToken || shareToken.length < 10) {
      throw new NotFoundException('Not found');
    }

    const alert = await this.prisma.alert.findUnique({
      where: { shareToken },
      select: {
        type: true,
        status: true,
        message: true,
        addressLandmark: true,
        createdAt: true,
        resolvedAt: true,
        cancelledAt: true,
        creator: {
          select: {
            fullName: true,
          },
        },
        trackingPoints: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: {
            latitude: true,
            longitude: true,
            accuracy: true,
            battery: true,
            createdAt: true,
          },
        },
      },
    });

    if (!alert) {
      throw new NotFoundException('Not found');
    }

    const track = alert.trackingPoints.slice().reverse();
    const latest = track.length > 0 ? track[track.length - 1] : null;

    return {
      person: alert.creator.fullName,
      type: alert.type,
      status: alert.status,
      message: alert.message,
      addressLandmark: alert.addressLandmark,
      startedAt: alert.createdAt,
      endedAt: alert.resolvedAt ?? alert.cancelledAt ?? null,
      latest,
      mapsLink: latest
        ? `https://maps.google.com/?q=${latest.latitude},${latest.longitude}`
        : null,
      totalPoints: track.length,
      track,
    };
  }

  async cancelAlert(userId: string, alertId: string) {
    const alert = await this.getOwnedActiveAlert(userId, alertId);

    const updated = await this.prisma.alert.update({
      where: { id: alert.id },
      data: {
        status: AlertStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    this.logger.log(`Alert ${alertId} cancelled by user ${userId}`);

    return {
      success: true,
      alertId: updated.id,
      status: updated.status,
    };
  }

  async resolveAlert(userId: string, alertId: string) {
    const alert = await this.getOwnedActiveAlert(userId, alertId);

    const updated = await this.prisma.alert.update({
      where: { id: alert.id },
      data: {
        status: AlertStatus.RESOLVED,
        resolvedAt: new Date(),
      },
    });

    this.logger.log(`Alert ${alertId} resolved (user is safe)`);

    return {
      success: true,
      alertId: updated.id,
      status: updated.status,
    };
  }

  async getMyActiveAlerts(userId: string) {
    await this.prisma.alert.updateMany({
      where: {
        creatorId: userId,
        status: AlertStatus.ACTIVE,
        expiresAt: { lt: new Date() },
      },
      data: {
        status: AlertStatus.EXPIRED,
      },
    });

    return this.prisma.alert.findMany({
      where: {
        creatorId: userId,
        status: AlertStatus.ACTIVE,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        _count: {
          select: {
            recipients: true,
          },
        },
      },
    });
  }

  async getMyAlerts(userId: string) {
    return this.prisma.alert.findMany({
      where: {
        creatorId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
      include: {
        _count: {
          select: {
            recipients: true,
          },
        },
      },
    });
  }

  async getAlertById(userId: string, alertId: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        creator: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
            avatarUrl: true,
          },
        },
        recipients: true,
      },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    if (alert.creatorId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return alert;
  }

  private async getOwnedActiveAlert(userId: string, alertId: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    if (alert.creatorId !== userId) {
      throw new ForbiddenException('Not your alert');
    }

    if (alert.status !== AlertStatus.ACTIVE) {
      throw new BadRequestException(`Alert is already ${alert.status.toLowerCase()}`);
    }

    return alert;
  }
}
