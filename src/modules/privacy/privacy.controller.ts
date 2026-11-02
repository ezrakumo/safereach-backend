import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrivacyService } from './privacy.service.js';
import { ConsentDto } from './dto/consent.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { GetUser } from '../../common/decorators/get-user.decorator.js';
import { RetentionService } from '../../infra/retention/retention.service.js';

@Controller()
export class PrivacyController {
  constructor(private privacy: PrivacyService, private retention: RetentionService) {}

  // Public: what the app shows on the consent screen
  @Get('legal')
  legal() { return this.privacy.legal(); }

  @Get('users/me/consent') @UseGuards(JwtAuthGuard)
  consent(@GetUser('id') userId: string) { return this.privacy.consentStatus(userId); }

  @Post('users/me/consent') @UseGuards(JwtAuthGuard) @HttpCode(HttpStatus.OK)
  updateConsent(@GetUser('id') userId: string, @Body() dto: ConsentDto) {
    return this.privacy.updateConsent(userId, dto);
  }

  @Get('users/me/export') @UseGuards(JwtAuthGuard)
  export(@GetUser('id') userId: string) { return this.privacy.exportData(userId); }

  @Get('users/me/data-summary') @UseGuards(JwtAuthGuard)
  summary(@GetUser('id') userId: string) { return this.privacy.dataSummary(userId); }

  // Admin: run the retention sweep now (normally runs 03:00 daily)
  @Post('admin/retention/run') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN) @HttpCode(HttpStatus.OK)
  runRetention(@GetUser('id') adminId: string) { return this.retention.run('admin', adminId); }

  @Get('admin/retention/policy') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
  policy() { return this.retention.policy(); }
}
