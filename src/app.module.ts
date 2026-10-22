import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './infra/database/prisma.module.js';
import { SmsModule } from './infra/sms/sms.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ContactsModule } from './modules/contacts/contacts.module.js';
import { AlertsModule } from './modules/alerts/alerts.module.js';
import { CheckinsModule } from './modules/checkins/checkins.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    SmsModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ContactsModule,
    AlertsModule,
    CheckinsModule,
    ReportsModule,
  ],
})
export class AppModule {}
