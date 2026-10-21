import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ReportStatus } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { CreateReportDto, NearbyReportsDto } from './dto/reports.dto.js';

type ReportWithAuthor = Prisma.ReportGetPayload<{
  include: { author: { select: { id: true; fullName: true } } };
}>;

const VISIBLE_STATUSES: ReportStatus[] = [ReportStatus.PENDING, ReportStatus.VERIFIED];

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly verifyThreshold: number;
  private readonly flagThreshold: number;
  private readonly expiryDays: number;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.verifyThreshold = Number(this.config.get('REPORT_VERIFICATION_THRESHOLD') ?? 3);
    this.flagThreshold = Number(this.config.get('REPORT_FLAG_THRESHOLD') ?? 5);
    this.expiryDays = Number(this.config.get('REPORT_EXPIRY_DAYS') ?? 30);
  }

  async createReport(userId: string, dto: CreateReportDto) {
    // Anti-spam: 1 report per minute per user
    const recent = await this.prisma.report.findFirst({
      where: { authorId: userId, createdAt: { gt: new Date(Date.now() - 60 * 1000) } },
      select: { id: true },
    });
    if (recent) {
      throw new BadRequestException('Please wait a minute before submitting another report');
    }

    const expiresAt = new Date(Date.now() + this.expiryDays * 24 * 60 * 60 * 1000);

    const report = await this.prisma.report.create({
      data: {
        authorId: userId,
        category: dto.category,
        title: dto.title.trim(),
        description: dto.description.trim(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        landmark: dto.landmark?.trim(),
        isAnonymous: dto.isAnonymous ?? false,
        expiresAt,
      },
    });

    this.logger.log(
      `[REPORT] ${report.id} created (${report.category}) at ${report.latitude},${report.longitude} - pending verification`,
    );
    return report;
  }

  // Danger Map: reports within radiusKm of a point, nearest first
  async getNearby(userId: string, q: NearbyReportsDto) {
    const radiusKm = q.radiusKm ?? 5;
    const limit = q.limit ?? 50;

    // Cheap bounding box first, exact distance after
    const latDelta = radiusKm / 111.32;
    const cosLat = Math.cos((q.latitude * Math.PI) / 180);
    const lngDelta = radiusKm / (111.32 * Math.max(Math.abs(cosLat), 0.01));

    const statuses = q.verifiedOnly ? [ReportStatus.VERIFIED] : VISIBLE_STATUSES;

    const rows = await this.prisma.report.findMany({
      where: {
        status: { in: statuses },
        deletedAt: null,
        expiresAt: { gt: new Date() },
        latitude: { gte: q.latitude - latDelta, lte: q.latitude + latDelta },
        longitude: { gte: q.longitude - lngDelta, lte: q.longitude + lngDelta },
      },
      include: { author: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return rows
      .map((r) => ({
        ...this.toPublic(r, userId),
        distanceKm: round2(haversineKm(q.latitude, q.longitude, r.latitude, r.longitude)),
      }))
      .filter((r) => r.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);
  }

  async getMine(userId: string) {
    return this.prisma.report.findMany({
      where: { authorId: userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getById(userId: string, reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: { author: { select: { id: true, fullName: true } } },
    });
    if (!report || report.deletedAt) throw new NotFoundException('Report not found');

    const isAuthor = report.authorId === userId;
    if (!isAuthor && !VISIBLE_STATUSES.includes(report.status)) {
      throw new NotFoundException('Report is not available');
    }
    return this.toPublic(report, userId);
  }

  async verifyReport(userId: string, reportId: string, isValid: boolean) {
    const report = await this.getVisible(reportId);
    if (report.authorId === userId) {
      throw new BadRequestException('You cannot verify your own report');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // One vote per user per report (changing your vote updates it)
      await tx.reportVerification.upsert({
        where: { reportId_userId: { reportId, userId } },
        create: { reportId, userId, isValid },
        update: { isValid },
      });

      const confirms = await tx.reportVerification.count({ where: { reportId, isValid: true } });
      const disputes = await tx.reportVerification.count({ where: { reportId, isValid: false } });

      const shouldVerify =
        report.status === ReportStatus.PENDING && confirms >= this.verifyThreshold;

      return tx.report.update({
        where: { id: reportId },
        data: {
          verifications: confirms,
          disputes,
          ...(shouldVerify ? { status: ReportStatus.VERIFIED } : {}),
        },
      });
    });

    if (report.status !== ReportStatus.VERIFIED && updated.status === ReportStatus.VERIFIED) {
      this.logger.log(
        `[REPORT] ${reportId} auto-verified (${updated.verifications} confirmations, threshold ${this.verifyThreshold})`,
      );
    }

    return {
      success: true,
      reportId,
      status: updated.status,
      verifications: updated.verifications,
      disputes: updated.disputes,
    };
  }

  async flagReport(userId: string, reportId: string, reason: string) {
    const report = await this.getVisible(reportId);
    if (report.authorId === userId) {
      throw new BadRequestException('You cannot flag your own report');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.reportFlag.upsert({
        where: { reportId_userId: { reportId, userId } },
        create: { reportId, userId, reason: reason.trim() },
        update: { reason: reason.trim() },
      });

      const flagCount = await tx.reportFlag.count({ where: { reportId } });
      const shouldHide = flagCount >= this.flagThreshold;

      return tx.report.update({
        where: { id: reportId },
        data: {
          flagCount,
          ...(shouldHide ? { status: ReportStatus.FLAGGED } : {}),
        },
      });
    });

    if (updated.status === ReportStatus.FLAGGED) {
      this.logger.warn(
        `[REPORT] ${reportId} hidden pending moderator review (${updated.flagCount} flags)`,
      );
    }

    return { success: true, reportId, status: updated.status, flagCount: updated.flagCount };
  }

  async deleteReport(userId: string, reportId: string) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report || report.deletedAt) throw new NotFoundException('Report not found');
    if (report.authorId !== userId) throw new ForbiddenException('Not your report');

    await this.prisma.report.update({
      where: { id: reportId },
      data: { deletedAt: new Date() },
    });
    return { success: true };
  }

  private async getVisible(reportId: string) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report || report.deletedAt) throw new NotFoundException('Report not found');
    if (!VISIBLE_STATUSES.includes(report.status)) {
      throw new NotFoundException('Report is not available');
    }
    return report;
  }

  // What other users are allowed to see (hides author identity when anonymous)
  private toPublic(r: ReportWithAuthor, viewerId: string) {
    return {
      id: r.id,
      category: r.category,
      status: r.status,
      title: r.title,
      description: r.description,
      latitude: r.latitude,
      longitude: r.longitude,
      landmark: r.landmark,
      isAnonymous: r.isAnonymous,
      authorName: r.isAnonymous ? null : r.author.fullName,
      isMine: r.authorId === viewerId,
      verifications: r.verifications,
      disputes: r.disputes,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    };
  }
}
