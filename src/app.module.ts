import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './infra/database/prisma.module.js';
import { SmsModule } from './infra/sms/sms.module.js';
import { AuditModule } from './infra/audit/audit.module.js';
import { RetentionModule } from './infra/retention/retention.module.js';
import { PrivacyModule } from './modules/privacy/privacy.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ContactsModule } from './modules/contacts/contacts.module.js';
import { AlertsModule } from './modules/alerts/alerts.module.js';
import { CheckinsModule } from './modules/checkins/checkins.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { AdminModule } from './modules/admin/admin.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    SmsModule,
    AuditModule,
    RetentionModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ContactsModule,
    AlertsModule,
    CheckinsModule,
    ReportsModule,
    AdminModule,
    PrivacyModule,
  ],
})
export class AppModule {}
