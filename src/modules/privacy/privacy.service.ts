import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { AuditService } from '../../infra/audit/audit.service.js';
import { RetentionService } from '../../infra/retention/retention.service.js';
import { ConsentDto } from './dto/consent.dto.js';

@Injectable()
export class PrivacyService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private audit: AuditService,
    private retention: RetentionService,
  ) {}

  legal() {
    return {
      privacyPolicyVersion: this.config.get('PRIVACY_POLICY_VERSION') ?? '1.0',
      privacyPolicyUrl: this.config.get('PRIVACY_POLICY_URL') ?? null,
      termsUrl: this.config.get('TERMS_URL') ?? null,
      dataProtectionOfficerEmail: this.config.get('DPO_EMAIL') ?? null,
      controller: 'SafeReach Nigeria',
      lawfulBasis: {
        account: 'Contract - providing the safety service you signed up for',
        location: 'Consent - collected only during SOS, tracking and check-ins you start',
        emergencyContacts: 'Legitimate interest / vital interest - notifying people you chose in an emergency',
        communityReports: 'Legitimate interest - public safety; anonymous option available',
      },
      retention: this.retention.policy(),
      yourRights: [
        'Access and export your data (GET /users/me/export)',
        'Correct your profile (PATCH /users/me)',
        'Withdraw consent (POST /users/me/consent)',
        'Delete your account (DELETE /users/me)',
        'Complain to the Nigeria Data Protection Commission (NDPC)',
      ],
    };
  }

  async consentStatus(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        privacyPolicyVersion: true, privacyAcceptedAt: true, termsAcceptedAt: true,
        locationConsentAt: true, marketingConsent: true,
      },
    });
    if (!u) throw new NotFoundException('User not found');
    const current = this.config.get<string>('PRIVACY_POLICY_VERSION') ?? '1.0';
    return {
      ...u,
      currentPolicyVersion: current,
      // App should show the consent screen again when this is true
      needsReconsent: !u.privacyAcceptedAt || u.privacyPolicyVersion !== current,
      hasLocationConsent: !!u.locationConsentAt,
    };
  }

  async updateConsent(userId: string, dto: ConsentDto) {
    const now = new Date();
    const current = this.config.get<string>('PRIVACY_POLICY_VERSION') ?? '1.0';
    const data: Record<string, unknown> = {};

    if (dto.acceptPrivacy === true) { data.privacyAcceptedAt = now; data.privacyPolicyVersion = current; }
    if (dto.acceptTerms === true) data.termsAcceptedAt = now;
    if (dto.locationConsent === true) data.locationConsentAt = now;
    if (dto.locationConsent === false) data.locationConsentAt = null;
    if (dto.marketingConsent !== undefined) data.marketingConsent = dto.marketingConsent;

    await this.prisma.user.update({ where: { id: userId }, data });
    await this.audit.log({
      actorId: userId, action: 'PRIVACY_CONSENT_UPDATE', entity: 'User', entityId: userId,
      metadata: { ...dto, policyVersion: current },
    });
    return this.consentStatus(userId);
  }

  // Right of access: everything we hold about this user, in one JSON document.
  async exportData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        contacts: true,
        alerts: { include: { recipients: true, trackingPoints: { orderBy: { createdAt: 'asc' } } } },
        checkIns: true,
        reports: true,
        reportVerifications: true,
        reportFlags: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const auditTrail = await this.prisma.auditLog.findMany({
      where: { actorId: userId },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: { createdAt: true, action: true, entity: true, entityId: true, ipAddress: true },
    });

    const { fcmToken, ...profile } = user;

    await this.audit.log({ actorId: userId, action: 'PRIVACY_DATA_EXPORT', entity: 'User', entityId: userId });

    return {
      exportedAt: new Date(),
      format: 'SafeReach data export v1',
      controller: 'SafeReach Nigeria',
      profile: { ...profile, pushNotificationsEnabled: !!fcmToken },
      auditTrail,
      retentionPolicy: this.retention.policy(),
      note: 'Location data older than the retention period has already been deleted and cannot be included.',
    };
  }

  async dataSummary(userId: string) {
    const [contacts, alerts, trackingPoints, checkIns, reports, auditRows] = await Promise.all([
      this.prisma.emergencyContact.count({ where: { userId } }),
      this.prisma.alert.count({ where: { creatorId: userId } }),
      this.prisma.trackingPoint.count({ where: { alert: { creatorId: userId } } }),
      this.prisma.checkIn.count({ where: { userId } }),
      this.prisma.report.count({ where: { authorId: userId } }),
      this.prisma.auditLog.count({ where: { actorId: userId } }),
    ]);
    const p = this.retention.policy();
    return {
      categories: [
        { name: 'Profile', items: 1, keptFor: 'Until you delete your account' },
        { name: 'Emergency contacts', items: contacts, keptFor: 'Until removed or account deleted' },
        { name: 'Alerts (SOS / missed check-ins)', items: alerts, keptFor: 'Until account deleted' },
        { name: 'Location history', items: trackingPoints, keptFor: `${p.trackingDays} days` },
        { name: 'Check-ins', items: checkIns, keptFor: 'Until account deleted' },
        { name: 'Community reports', items: reports, keptFor: `${p.reportDays} days on the map; anonymised on account deletion` },
        { name: 'Activity log', items: auditRows, keptFor: `${p.auditDays} days` },
      ],
    };
  }
}
