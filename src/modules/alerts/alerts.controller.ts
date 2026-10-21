import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AlertsService } from './alerts.service.js';
import { TriggerSosDto } from './dto/trigger-sos.dto.js';
import { CreateTrackPointDto } from './dto/create-track-point.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { GetUser } from '../../common/decorators/get-user.decorator.js';

@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private alerts: AlertsService) {}

  // POST /api/v1/alerts/sos -> the big red SOS button
  @Post('sos')
  @HttpCode(HttpStatus.CREATED)
  triggerSOS(@GetUser('id') userId: string, @Body() dto: TriggerSosDto) {
    return this.alerts.triggerSOS(userId, dto);
  }

  // GET /api/v1/alerts/active -> my currently active alerts
  @Get('active')
  getActive(@GetUser('id') userId: string) {
    return this.alerts.getMyActiveAlerts(userId);
  }

  // GET /api/v1/alerts -> my alert history
  @Get()
  getAll(@GetUser('id') userId: string) {
    return this.alerts.getMyAlerts(userId);
  }

  // GET /api/v1/alerts/:id -> one alert with its recipients
  @Get(':id')
  getOne(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.alerts.getAlertById(userId, id);
  }

  // POST /api/v1/alerts/:id/track -> live location ping (while ACTIVE)
  @Post(':id/track')
  @HttpCode(HttpStatus.CREATED)
  addPoint(
    @GetUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateTrackPointDto,
  ) {
    return this.alerts.addTrackPoint(userId, id, dto);
  }

  // GET /api/v1/alerts/:id/track -> the movement trail
  @Get(':id/track')
  track(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.alerts.getTrack(userId, id);
  }

  // POST /api/v1/alerts/:id/cancel -> false alarm
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.alerts.cancelAlert(userId, id);
  }

  // POST /api/v1/alerts/:id/resolve -> "I am safe now"
  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  resolve(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.alerts.resolveAlert(userId, id);
  }
}
