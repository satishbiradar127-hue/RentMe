import * as https from 'node:https';
import { NotificationChannel } from '../models/notification';

// --- Email Provider Boundary ---

export interface EmailParams {
  to: string;
  subject: string;
  body: string;
  html?: string;
  idempotencyKey?: string;
}

export interface EmailDeliveryResult {
  success: boolean;
  provider: string;
  messageId: string;
  deliveredAt: string;
  error?: string;
}

export interface EmailProvider {
  name: string;
  sendEmail(params: EmailParams): Promise<EmailDeliveryResult>;
}

export class MockEmailProvider implements EmailProvider {
  public name = 'mock-email';
  private sentLog: Array<EmailParams & { messageId: string; timestamp: string }> = [];

  async sendEmail(params: EmailParams): Promise<EmailDeliveryResult> {
    const messageId = `email_mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const timestamp = new Date().toISOString();
    const record = { ...params, messageId, timestamp };
    this.sentLog.push(record);
    console.log(`[Email Mock] Sent to: ${params.to} | Subject: "${params.subject}"`);
    return {
      success: true,
      provider: this.name,
      messageId,
      deliveredAt: timestamp
    };
  }

  getSentLog(): Array<EmailParams & { messageId: string; timestamp: string }> {
    return [...this.sentLog];
  }

  clearLog(): void {
    this.sentLog = [];
  }
}

export class ResendEmailProvider implements EmailProvider {
  public name = 'resend';
  private apiKey: string;
  private fromAddress: string;

  constructor(apiKey: string, fromAddress: string = 'RentMe <notifications@rentme.local>') {
    this.apiKey = apiKey;
    this.fromAddress = fromAddress;
  }

  async sendEmail(params: EmailParams): Promise<EmailDeliveryResult> {
    return new Promise((resolve) => {
      const payload = JSON.stringify({
        from: this.fromAddress,
        to: [params.to],
        subject: params.subject,
        text: params.body,
        html: params.html || `<p>${params.body}</p>`,
        headers: params.idempotencyKey ? { 'Idempotency-Key': params.idempotencyKey } : undefined
      });

      const req = https.request(
        {
          hostname: 'api.resend.com',
          path: '/emails',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            const timestamp = new Date().toISOString();
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const parsed = JSON.parse(data);
                resolve({
                  success: true,
                  provider: this.name,
                  messageId: parsed.id || `resend_${Date.now()}`,
                  deliveredAt: timestamp
                });
              } catch {
                resolve({
                  success: true,
                  provider: this.name,
                  messageId: `resend_${Date.now()}`,
                  deliveredAt: timestamp
                });
              }
            } else {
              resolve({
                success: false,
                provider: this.name,
                messageId: '',
                deliveredAt: timestamp,
                error: `Resend error HTTP ${res.statusCode}: ${data}`
              });
            }
          });
        }
      );

      req.on('error', (err) => {
        resolve({
          success: false,
          provider: this.name,
          messageId: '',
          deliveredAt: new Date().toISOString(),
          error: err.message
        });
      });

      req.write(payload);
      req.end();
    });
  }
}

// --- SMS Provider Boundary ---

export interface SmsParams {
  to: string;
  message: string;
  idempotencyKey?: string;
}

export interface SmsDeliveryResult {
  success: boolean;
  provider: string;
  messageId: string;
  deliveredAt: string;
  error?: string;
}

export interface SmsProvider {
  name: string;
  sendSms(params: SmsParams): Promise<SmsDeliveryResult>;
}

export class MockSmsProvider implements SmsProvider {
  public name = 'mock-sms';
  private sentLog: Array<SmsParams & { messageId: string; timestamp: string }> = [];

  async sendSms(params: SmsParams): Promise<SmsDeliveryResult> {
    const messageId = `sms_mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const timestamp = new Date().toISOString();
    const record = { ...params, messageId, timestamp };
    this.sentLog.push(record);
    console.log(`[SMS Mock] Sent to: ${params.to} | Message: "${params.message}"`);
    return {
      success: true,
      provider: this.name,
      messageId,
      deliveredAt: timestamp
    };
  }

  getSentLog(): Array<SmsParams & { messageId: string; timestamp: string }> {
    return [...this.sentLog];
  }

  clearLog(): void {
    this.sentLog = [];
  }
}

export class TwilioSmsProvider implements SmsProvider {
  public name = 'twilio';
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor(accountSid: string, authToken: string, fromNumber: string = '+15005550006') {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.fromNumber = fromNumber;
  }

  async sendSms(params: SmsParams): Promise<SmsDeliveryResult> {
    return new Promise((resolve) => {
      const postData = new URLSearchParams({
        To: params.to,
        From: this.fromNumber,
        Body: params.message
      }).toString();

      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

      const req = https.request(
        {
          hostname: 'api.twilio.com',
          path: `/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
          }
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            const timestamp = new Date().toISOString();
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const parsed = JSON.parse(data);
                resolve({
                  success: true,
                  provider: this.name,
                  messageId: parsed.sid || `twilio_${Date.now()}`,
                  deliveredAt: timestamp
                });
              } catch {
                resolve({
                  success: true,
                  provider: this.name,
                  messageId: `twilio_${Date.now()}`,
                  deliveredAt: timestamp
                });
              }
            } else {
              resolve({
                success: false,
                provider: this.name,
                messageId: '',
                deliveredAt: timestamp,
                error: `Twilio error HTTP ${res.statusCode}: ${data}`
              });
            }
          });
        }
      );

      req.on('error', (err) => {
        resolve({
          success: false,
          provider: this.name,
          messageId: '',
          deliveredAt: new Date().toISOString(),
          error: err.message
        });
      });

      req.write(postData);
      req.end();
    });
  }
}

// --- Provider Factories & Singletons ---

let emailProviderInstance: EmailProvider | null = null;
let smsProviderInstance: SmsProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (!emailProviderInstance) {
    const resendApiKey = process.env.RESEND_API_KEY?.trim() || process.env.EMAIL_API_KEY?.trim();
    if (resendApiKey) {
      console.log('[Email] Resend live email provider initialized.');
      emailProviderInstance = new ResendEmailProvider(resendApiKey);
    } else {
      emailProviderInstance = new MockEmailProvider();
    }
  }
  return emailProviderInstance;
}

export function setEmailProvider(provider: EmailProvider | null): void {
  emailProviderInstance = provider;
}

export function getSmsProvider(): SmsProvider {
  if (!smsProviderInstance) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    if (accountSid && authToken) {
      console.log('[SMS] Twilio live SMS provider initialized.');
      smsProviderInstance = new TwilioSmsProvider(
        accountSid,
        authToken,
        process.env.TWILIO_FROM_NUMBER?.trim() || '+15005550006'
      );
    } else {
      smsProviderInstance = new MockSmsProvider();
    }
  }
  return smsProviderInstance;
}

export function setSmsProvider(provider: SmsProvider | null): void {
  smsProviderInstance = provider;
}

// --- Backward Compatibility Interfaces & Classes ---

export interface SendNotificationParams {
  userId: string;
  channel: NotificationChannel;
  title: string;
  message: string;
  recipientAddress?: string; // phone or email
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

export interface NotificationResult {
  success: boolean;
  notificationId: string;
  deliveredAt: string;
  error?: string;
}

export interface NotificationProvider {
  send(params: SendNotificationParams): Promise<NotificationResult>;
}

export class MockNotificationProvider implements NotificationProvider {
  private sentLog: Array<SendNotificationParams & { id: string; timestamp: string }> = [];

  async send(params: SendNotificationParams): Promise<NotificationResult> {
    const id = `notif_mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const record = {
      ...params,
      id,
      timestamp: new Date().toISOString()
    };
    this.sentLog.push(record);
    return {
      success: true,
      notificationId: id,
      deliveredAt: record.timestamp
    };
  }

  getSentLog() {
    return [...this.sentLog];
  }

  clearLog() {
    this.sentLog = [];
  }
}

