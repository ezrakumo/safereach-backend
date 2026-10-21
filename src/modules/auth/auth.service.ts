import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { SmsService } from '../../infra/sms/sms.service.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private sms: SmsService,
  ) {}

  async sendOtp(phoneNumber: string) {
    const normalized = this.normalizePhone(phoneNumber);
    const code = crypto.randomInt(100000, 999999).toString();
    const expiryMin = Number(this.config.get('OTP_EXPIRY_MINUTES') ?? 5);
    const expiresAt = new Date(Date.now() + expiryMin * 60 * 1000);

    // Invalidate previous unverified OTPs
    await this.prisma.otp.updateMany({
      where: { phoneNumber: normalized, verified: false },
      data: { verified: true },
    });

    await this.prisma.otp.create({
      data: { phoneNumber: normalized, code, expiresAt },
    });

    const message = `Your SafeReach verification code is ${code}. It expires in ${expiryMin} minutes. Do not share this code.`;
    const sms = await this.sms.sendToOne(normalized, message);

    if (sms.attempted && sms.deliveredTo.length === 0) {
      this.logger.error(`[AUTH] OTP SMS to ${normalized} NOT delivered: ${sms.errors.join('; ')}`);
    }

    // Safety net for development: if the real SMS failed, expose the code so
    // you cannot get locked out while testing. Removed in production.
    const isDev = this.config.get('NODE_ENV') !== 'production';
    const showDevOtp = isDev && (!sms.attempted || sms.deliveredTo.length === 0);

    return {
      success: true,
      message: sms.deliveredTo.length > 0 ? 'OTP sent by SMS' : 'OTP generated',
      expiresInSeconds: expiryMin * 60,
      ...(showDevOtp ? { devOtp: code } : {}),
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

    if (!user) {
      if (!fullName || fullName.trim().length < 2) {
        throw new BadRequestException('Full name is required for first-time signup');
      }
      user = await this.prisma.user.create({
        data: { fullName: fullName.trim(), phoneNumber: normalized, phoneVerified: true },
      });
    } else if (!user.phoneVerified) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { phoneVerified: true },
      });
    }

    if (user.isBanned) throw new UnauthorizedException('Account suspended');

    const tokens = await this.generateTokens(user.id, user.phoneNumber);
    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        avatarUrl: user.avatarUrl,
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
