import { Module } from '@nestjs/common';
import { CheckinsService } from './checkins.service.js';
import { CheckinsController } from './checkins.controller.js';

@Module({
  providers: [CheckinsService],
  controllers: [CheckinsController],
  exports: [CheckinsService],
})
export class CheckinsModule {}
