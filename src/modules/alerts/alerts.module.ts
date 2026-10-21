import { Module } from '@nestjs/common';
import { AlertsService } from './alerts.service.js';
import { AlertsController } from './alerts.controller.js';
import { PublicAlertsController } from './public-alerts.controller.js';

@Module({
  providers: [AlertsService],
  controllers: [AlertsController, PublicAlertsController],
  exports: [AlertsService],
})
export class AlertsModule {}
