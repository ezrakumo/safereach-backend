import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { SmsService } from '../../infra/sms/sms.service.js';
import { AuditService } from '../../infra/audit/audit.service.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private sms: SmsService,
    private audit: AuditService,
  ) {}

  async sendOtp(phoneNumber: string) {
    const normalized = this.normalizePhone(phoneNumber);
    const code = crypto.randomInt(100000, 999999).toString();
    const expiryMin = Number(this.config.get('OTP_EXPIRY_MINUTES') ?? 5);
    const expiresAt = new Date(Date.now() + expiryMin * 60 * 1000);

    await this.prisma.otp.updateMany({
      where: { phoneNumber: normalized, verified: false },
      data: { verified: true },
    });

    await this.prisma.otp.create({ data: { phoneNumber: normalized, code, expiresAt } });

    const message = `Your SafeReach verification code is ${code}. It expires in ${expiryMin} minutes. Do not share this code.`;
    const sms = await this.sms.sendToOne(normalized, message);

    if (sms.attempted && sms.deliveredTo.length === 0) {
      this.logger.error(`[AUTH] OTP SMS to ${normalized} NOT delivered: ${sms.errors.join('; ')}`);
    }

    const allowDevOtp =
      String(this.config.get('ALLOW_DEV_OTP') ?? 'false').toLowerCase() === 'true';

    return {
      success: true,
      message: sms.deliveredTo.length > 0 ? 'OTP sent by SMS' : 'OTP generated',
      expiresInSeconds: expiryMin * 60,
      ...(allowDevOtp ? { devOtp: code } : {}),
    };
  }

  async verifyOtp(phoneNumber: string, code: string, fullName?: string) {
    const normalized = this.normalizePhone(phoneNumber);

    const otp = await this.prisma.otp.findFirst({
      where: { phoneNumber: normalized, verified: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) throw new UnauthorizedException('Invalid or expired OTP');
    if (otp.attempts >= 5) {
      await this.prisma.otp.update({ where: { id: otp.id }, data: { verified: true } });
      throw new UnauthorizedException('Too many attempts. Request a new OTP');
    }
    if (otp.code !== code) {
      await this.prisma.otp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new UnauthorizedException('Invalid OTP code');
    }

    await this.prisma.otp.update({ where: { id: otp.id }, data: { verified: true } });

    let user = await this.prisma.user.findUnique({ where: { phoneNumber: normalized } });
    let isNew = false;

    if (!user) {
      if (!fullName || fullName.trim().length < 2) {
        throw new BadRequestException('Full name is required for first-time signup');
      }
            const now = new Date();
      user = await this.prisma.user.create({
        data: {
          fullName: fullName.trim(),
          phoneNumber: normalized,
          phoneVerified: true,
          // Signing up implies acceptance of the policy version shown in the app
          privacyPolicyVersion: this.config.get<string>('PRIVACY_POLICY_VERSION') ?? '1.0',
          privacyAcceptedAt: now,
          termsAcceptedAt: now,
        },
      });
      isNew = true;
    } else if (!user.phoneVerified) {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true } });
    }

    if (user.isBanned) throw new UnauthorizedException('Account suspended');
    if (!user.isActive) throw new UnauthorizedException('Account is not active');

    // Bootstrap admins from ADMIN_PHONES (comma-separated)
    if (user.role !== UserRole.ADMIN && this.isConfiguredAdmin(normalized)) {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { role: UserRole.ADMIN } });
      this.logger.warn(`[AUTH] ${normalized} promoted to ADMIN via ADMIN_PHONES`);
    }

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: isNew ? 'AUTH_SIGNUP' : 'AUTH_LOGIN',
      entity: 'User',
      entityId: user.id,
    });

    const tokens = await this.generateTokens(user.id, user.phoneNumber);
    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        avatarUrl: user.avatarUrl,
        role: user.role,
      },
      ...tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.isBanned || !user.isActive) throw new UnauthorizedException();
      return this.generateTokens(user.id, user.phoneNumber);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private isConfiguredAdmin(normalizedPhone: string): boolean {
    const raw = this.config.get<string>('ADMIN_PHONES') ?? '';
    return raw
      .split(',')
      .map((p) => this.normalizePhone(p.trim()))
      .filter(Boolean)
      .includes(normalizedPhone);
  }

  private async generateTokens(userId: string, phoneNumber: string) {
    const payload = { sub: userId, phone: phoneNumber };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_EXPIRES_IN') || '7d',
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN') || '30d',
    });
    return { accessToken, refreshToken };
  }

  private normalizePhone(phone: string): string {
    let p = (phone ?? '').replace(/[\s-]/g, '');
    if (p.startsWith('0') && p.length === 11) p = '+234' + p.substring(1);
    else if (!p.startsWith('+') && p.length === 10) p = '+234' + p;
    else if (p.startsWith('234') && !p.startsWith('+')) p = '+' + p;
    return p;
  }
}
