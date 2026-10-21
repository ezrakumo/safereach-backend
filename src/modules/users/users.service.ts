import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AlertStatus, CheckInStatus } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { UpdateProfileDto } from './dto/users.dto.js';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        phoneVerified: true,
        avatarUrl: true,
        isActive: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const data: Record<string, unknown> = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl.trim();

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nothing to update');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        avatarUrl: true,
        updatedAt: true,
      },
    });

    this.logger.log(`[PROFILE] ${userId} updated`);
    return user;
  }

  // Mobile app calls this after Firebase hands it a device token
  async saveFcmToken(userId: string, fcmToken: string) {
    const token = fcmToken.trim();

    // A device token must belong to one account only, or push goes to the wrong person
    await this.prisma.user.updateMany({
      where: { fcmToken: token, NOT: { id: userId } },
      data: { fcmToken: null },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { fcmToken: token },
    });

    this.logger.log(`[PROFILE] ${userId} registered a push token`);
    return { success: true, pushEnabled: true };
  }

  // Called on logout so a shared/old device stops receiving this user's alerts
  async clearFcmToken(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { fcmToken: null },
    });
    return { success: true, pushEnabled: false };
  }

  // Numbers for the Profile tab
  async getSummary(userId: string) {
    const [contacts, activeAlerts, totalAlerts, pendingCheckIns, reports, user] =
      await Promise.all([
        this.prisma.emergencyContact.count({ where: { userId, isActive: true } }),
        this.prisma.alert.count({
          where: { creatorId: userId, status: AlertStatus.ACTIVE },
        }),
        this.prisma.alert.count({ where: { creatorId: userId } }),
        this.prisma.checkIn.count({
          where: { userId, status: CheckInStatus.PENDING },
        }),
        this.prisma.report.count({ where: { authorId: userId, deletedAt: null } }),
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { fcmToken: true, createdAt: true },
        }),
      ]);

    if (!user) throw new NotFoundException('User not found');

    return {
      contacts,
      activeAlerts,
      totalAlerts,
      pendingCheckIns,
      reports,
      pushEnabled: Boolean(user.fcmToken),
      memberSince: user.createdAt,
      // Nudge the UI to show a warning - SOS is useless with no contacts
      needsContacts: contacts === 0,
    };
  }

  async deleteAccount(userId: string, confirmPhone: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (this.normalizePhone(confirmPhone) !== user.phoneNumber) {
      throw new BadRequestException(
        'confirmPhone does not match the phone number on this account',
      );
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Never leave an alert hanging after the account is gone
      await tx.alert.updateMany({
        where: { creatorId: userId, status: AlertStatus.ACTIVE },
        data: { status: AlertStatus.CANCELLED, cancelledAt: now },
      });

      await tx.checkIn.updateMany({
        where: { userId, status: CheckInStatus.PENDING },
        data: { status: CheckInStatus.CANCELLED, cancelledAt: now },
      });

      // Keep community danger reports on the map, but strip the identity
      await tx.report.updateMany({
        where: { authorId: userId, deletedAt: null },
        data: { isAnonymous: true },
      });

      await tx.emergencyContact.updateMany({
        where: { userId },
        data: { isActive: false },
      });

      await tx.otp.deleteMany({ where: { phoneNumber: user.phoneNumber } });

      // Anonymise and release the phone number so it can be reused
      await tx.user.update({
        where: { id: userId },
        data: {
          fullName: 'Deleted user',
          phoneNumber: `deleted-${userId}`,
          phoneVerified: false,
          avatarUrl: null,
          fcmToken: null,
          isActive: false,
        },
      });
    });

    this.logger.warn(`[PROFILE] Account ${userId} deleted and anonymised`);
    return {
      success: true,
      message: 'Account deleted. Your personal details have been removed.',
    };
  }

  private normalizePhone(phone: string): string {
    let p = phone.replace(/[\s-]/g, '');
    if (p.startsWith('0') && p.length === 11) p = '+234' + p.substring(1);
    else if (!p.startsWith('+') && p.length === 10) p = '+234' + p;
    else if (p.startsWith('234') && !p.startsWith('+')) p = '+' + p;
    return p;
  }
}
