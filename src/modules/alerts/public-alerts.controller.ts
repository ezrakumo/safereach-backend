import { Controller, Get, Param } from '@nestjs/common';
import { AlertsService } from './alerts.service.js';

// Public endpoints - no JWT. Security comes from the unguessable shareToken
// that is only sent to the user's chosen emergency contacts.
@Controller('public/alerts')
export class PublicAlertsController {
  constructor(private alerts: AlertsService) {}

  // GET /api/v1/public/alerts/:shareToken -> live view for contacts
  @Get(':shareToken')
  track(@Param('shareToken') shareToken: string) {
    return this.alerts.getPublicTrack(shareToken);
  }
}
