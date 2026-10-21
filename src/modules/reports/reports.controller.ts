import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReportsService } from './reports.service.js';
import {
  CreateReportDto,
  FlagReportDto,
  NearbyReportsDto,
  VerifyReportDto,
} from './dto/reports.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { GetUser } from '../../common/decorators/get-user.decorator.js';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private reports: ReportsService) {}

  // POST /api/v1/reports -> submit a danger report
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@GetUser('id') userId: string, @Body() dto: CreateReportDto) {
    return this.reports.createReport(userId, dto);
  }

  // GET /api/v1/reports/nearby?latitude=..&longitude=..&radiusKm=5 -> the Danger Map
  @Get('nearby')
  nearby(@GetUser('id') userId: string, @Query() q: NearbyReportsDto) {
    return this.reports.getNearby(userId, q);
  }

  // GET /api/v1/reports/mine -> my own reports
  @Get('mine')
  mine(@GetUser('id') userId: string) {
    return this.reports.getMine(userId);
  }

  // GET /api/v1/reports/:id
  @Get(':id')
  getOne(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.reports.getById(userId, id);
  }

  // POST /api/v1/reports/:id/verify  body: { "isValid": true } (false = dispute)
  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  verify(
    @GetUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: VerifyReportDto,
  ) {
    return this.reports.verifyReport(userId, id, dto.isValid ?? true);
  }

  // POST /api/v1/reports/:id/flag  body: { "reason": "..." }
  @Post(':id/flag')
  @HttpCode(HttpStatus.OK)
  flag(
    @GetUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: FlagReportDto,
  ) {
    return this.reports.flagReport(userId, id, dto.reason);
  }

  // DELETE /api/v1/reports/:id -> remove your own report
  @Delete(':id')
  remove(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.reports.deleteReport(userId, id);
  }
}
