import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import AfricasTalking from 'africastalking';

export interface SmsResult {
  attempted: boolean; // false in dev mode (nothing was really sent)
  deliveredTo: string[]; // phone numbers (E.164) the provider accepted
  failedTo: string[];
  errors: string[];
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private client: any = null;
  private mode: 'dev' | 'real' = 'dev';

  constructor(private config: ConfigService) {
    const configured = (this.config.get<string>('SMS_MODE') ?? 'dev').toLowerCase();
    this.mode = configured === 'real' ? 'real' : 'dev';

    if (this.mode === 'real') {
      const apiKey = this.config.get<string>('AT_API_KEY');
      const username = this.config.get<string>('AT_USERNAME') ?? 'sandbox';
      if (!apiKey) {
        this.logger.error('SMS_MODE=real but AT_API_KEY is missing. Falling back to DEV mode.');
        this.mode = 'dev';
      } else {
        this.client = AfricasTalking({ apiKey, username });
        this.logger.log(`[SMS] Enabled via Africa's Talking (username=${username})`);
      }
    } else {
      this.logger.log('[SMS] DEV mode - messages are printed to the console only.');
    }
  }

  get isDev(): boolean {
    return this.mode === 'dev';
  }

  // Never throws: OTP and SOS must not break because SMS is down.
  async sendToMany(recipients: string[], message: string): Promise<SmsResult> {
    const to = [...new Set(recipients.map((p) => this.normalize(p)).filter(Boolean))];

    if (to.length === 0) {
      return { attempted: false, deliveredTo: [], failedTo: [], errors: [] };
    }

    if (this.mode === 'dev' || !this.client) {
      this.logger.warn(`[DEV SMS] To ${to.join(', ')}: ${message}`);
      return { attempted: false, deliveredTo: to, failedTo: [], errors: [] };
    }

    try {
      const payload: Record<string, unknown> = { to, message };
      const senderId = this.config.get<string>('AT_SENDER_ID');
      if (senderId) payload.from = senderId; // live mode only (approved sender ID)

      const res: any = await this.client.SMS.send(payload);
      const list: any[] = res?.SMSMessageData?.Recipients ?? [];
      const okCodes = new Set([100, 101, 102]); // Processed / Sent / Buffered

      const deliveredTo: string[] = [];
      const failedTo: string[] = [];
      const errors: string[] = [];

      for (const r of list) {
        if (okCodes.has(r.statusCode)) deliveredTo.push(this.normalize(r.number));
        else {
          failedTo.push(this.normalize(r.number));
          errors.push(`${r.number}: ${r.status} (${r.statusCode})`);
        }
      }
      if (list.length === 0) {
        failedTo.push(...to);
        errors.push('Provider returned no recipients');
      }

      this.logger.log(
        `[SMS] accepted=${deliveredTo.length} failed=${failedTo.length}` +
          (errors.length > 0 ? ` (${errors.join('; ')})` : ''),
      );
      return { attempted: true, deliveredTo, failedTo, errors };
    } catch (err) {
      this.logger.error(`[SMS] send failed: ${(err as Error).message}`);
      return {
        attempted: true,
        deliveredTo: [],
        failedTo: to,
        errors: [(err as Error).message],
      };
    }
  }

  async sendToOne(recipient: string, message: string): Promise<SmsResult> {
    return this.sendToMany([recipient], message);
  }

  private normalize(phone: string): string {
    let p = (phone ?? '').replace(/[\s-]/g, '');
    if (p.startsWith('0') && p.length === 11) p = '+234' + p.substring(1);
    else if (!p.startsWith('+') && p.length === 10) p = '+234' + p;
    else if (p.startsWith('234') && !p.startsWith('+')) p = '+' + p;
    return p;
  }
}
