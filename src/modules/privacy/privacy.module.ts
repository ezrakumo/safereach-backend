import { Module } from '@nestjs/common';
import { PrivacyService } from './privacy.service.js';
import { PrivacyController } from './privacy.controller.js';

@Module({
  providers: [PrivacyService],
  controllers: [PrivacyController],
})
export class PrivacyModule {}
