import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import {
  DeleteAccountDto,
  FcmTokenDto,
  UpdateProfileDto,
} from './dto/users.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { GetUser } from '../../common/decorators/get-user.decorator.js';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  // GET /api/v1/users/me
  @Get('me')
  me(@GetUser('id') userId: string) {
    return this.users.getProfile(userId);
  }

  // PATCH /api/v1/users/me
  @Patch('me')
  update(@GetUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(userId, dto);
  }

  // GET /api/v1/users/me/summary -> counts for the Profile tab
  @Get('me/summary')
  summary(@GetUser('id') userId: string) {
    return this.users.getSummary(userId);
  }

  // POST /api/v1/users/me/fcm-token -> register device for push
  @Post('me/fcm-token')
  @HttpCode(HttpStatus.OK)
  saveToken(@GetUser('id') userId: string, @Body() dto: FcmTokenDto) {
    return this.users.saveFcmToken(userId, dto.fcmToken);
  }

  // DELETE /api/v1/users/me/fcm-token -> call this on logout
  @Delete('me/fcm-token')
  @HttpCode(HttpStatus.OK)
  clearToken(@GetUser('id') userId: string) {
    return this.users.clearFcmToken(userId);
  }

  // DELETE /api/v1/users/me  body: { "confirmPhone": "0801..." }
  @Delete('me')
  @HttpCode(HttpStatus.OK)
  remove(@GetUser('id') userId: string, @Body() dto: DeleteAccountDto) {
    return this.users.deleteAccount(userId, dto.confirmPhone);
  }
}
