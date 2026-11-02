import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AdminService } from './admin.service.js';
import { AuditQueryDto, ReasonDto, UserSearchDto } from './dto/admin.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { GetUser } from '../../common/decorators/get-user.decorator.js';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('stats')
  stats() { return this.admin.stats(); }

  @Get('reports/flagged')
  flagged() { return this.admin.flaggedReports(); }

  @Get('reports/pending')
  pending() { return this.admin.pendingReports(); }

  @Post('reports/:id/approve') @HttpCode(HttpStatus.OK)
  approve(@GetUser() actor: any, @Param('id') id: string) {
    return this.admin.approveReport(actor, id);
  }

  @Post('reports/:id/reject') @HttpCode(HttpStatus.OK)
  reject(@GetUser() actor: any, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.admin.rejectReport(actor, id, dto.reason);
  }

  @Get('users')
  users(@Query() q: UserSearchDto) { return this.admin.searchUsers(q.q, q.limit); }

  @Post('users/:id/ban') @HttpCode(HttpStatus.OK)
  ban(@GetUser() actor: any, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.admin.banUser(actor, id, dto.reason);
  }

  @Post('users/:id/unban') @HttpCode(HttpStatus.OK)
  unban(@GetUser() actor: any, @Param('id') id: string) {
    return this.admin.unbanUser(actor, id);
  }

  @Get('audit-logs')
  audit(@Query() q: AuditQueryDto) { return this.admin.auditLogs(q); }
}
