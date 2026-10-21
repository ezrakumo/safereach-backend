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
import { CheckinsService } from './checkins.service.js';
import { CreateCheckInDto } from './dto/create-checkin.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { GetUser } from '../../common/decorators/get-user.decorator.js';

@Controller('checkins')
@UseGuards(JwtAuthGuard)
export class CheckinsController {
  constructor(private checkins: CheckinsService) {}

  // POST /api/v1/checkins -> schedule a check-in
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@GetUser('id') userId: string, @Body() dto: CreateCheckInDto) {
    return this.checkins.createCheckIn(userId, dto);
  }

  // GET /api/v1/checkins/pending -> upcoming check-ins (for the countdown UI)
  @Get('pending')
  pending(@GetUser('id') userId: string) {
    return this.checkins.getPending(userId);
  }

  // GET /api/v1/checkins -> history
  @Get()
  list(@GetUser('id') userId: string) {
    return this.checkins.getMine(userId);
  }

  // GET /api/v1/checkins/:id
  @Get(':id')
  getOne(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.checkins.getById(userId, id);
  }

  // POST /api/v1/checkins/:id/safe -> "I'm safe"
  @Post(':id/safe')
  @HttpCode(HttpStatus.OK)
  safe(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.checkins.markSafe(userId, id);
  }

  // POST /api/v1/checkins/:id/cancel
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.checkins.cancelCheckIn(userId, id);
  }
}
