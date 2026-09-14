import * as crypto from 'node:crypto';
import * as https from 'node:https';

export interface PaymentChargeParams {
  bookingId: string;
  customerId: string;
  amount: number;
  currency: string;
  orderId?: string;
  paymentId?: string;
  signature?: string;
}

export interface PaymentRefundParams {
  paymentId: string;
  amount: number;
  reason?: string;
}

export interface PaymentOrderParams {
  bookingId: string;
  customerId: string;
  amount: number;
  currency: string;
  notes?: Record<string, any>;
}

export interface PaymentOrderResult {
  orderId: string;
  amount: number;
  currency: string;
  keyId?: string;
  status: string;
}

export interface PaymentProviderResult {
  success: boolean;
  transactionId: string;
  status: 'captured' | 'refunded' | 'failed';
  errorMessage?: string;
}

export interface PaymentWebhookVerification {
  valid: boolean;
  eventType?: string;
  orderId?: string;
  paymentId?: string;
  amount?: number;
  currency?: string;
  bookingId?: string;
  error?: string;
  rawEvent?: any;
}

export interface PaymentProvider {
  name: string;
  createOrder(params: PaymentOrderParams): Promise<PaymentOrderResult>;
  verifyWebhookSignature(rawBody: string, signature: string): PaymentWebhookVerification;
  charge(params: PaymentChargeParams): Promise<PaymentProviderResult>;
  refund(params: PaymentRefundParams): Promise<PaymentProviderResult>;
}

export class MockPaymentProvider implements PaymentProvider {
  public name = 'mock';
  private defaultSecret = 'rentme_mock_webhook_secret_2026';

  async createOrder(params: PaymentOrderParams): Promise<PaymentOrderResult> {
    const orderId = `order_mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      orderId,
      amount: params.amount,
      currency: params.currency || 'INR',
      keyId: 'rzp_test_mock_key_id',
      status: 'created'
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string): PaymentWebhookVerification {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || this.defaultSecret;
    try {
      const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      const isValid = signature === computed || signature === 'mock_valid_signature';

      if (!isValid) {
        return { valid: false, error: 'Signature mismatch' };
      }

      const parsed = JSON.parse(rawBody);
      const eventType = parsed.event || 'payment.captured';
      const paymentEntity = parsed.payload?.payment?.entity || {};
      const orderEntity = parsed.payload?.order?.entity || {};

      const bookingId =
        paymentEntity.notes?.bookingId ||
        orderEntity.notes?.bookingId ||
        parsed.bookingId;

      return {
        valid: true,
        eventType,
        orderId: paymentEntity.order_id || orderEntity.id || parsed.orderId,
        paymentId: paymentEntity.id || parsed.paymentId || `pay_mock_${Date.now()}`,
        amount: paymentEntity.amount ? paymentEntity.amount / 100 : parsed.amount,
        currency: paymentEntity.currency || parsed.currency || 'INR',
        bookingId,
        rawEvent: parsed
      };
    } catch (err: any) {
      return { valid: false, error: err.message };
    }
  }

  async charge(params: PaymentChargeParams): Promise<PaymentProviderResult> {
    const transactionId = params.paymentId || `pay_mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      success: true,
      transactionId,
      status: 'captured'
    };
  }

  async refund(params: PaymentRefundParams): Promise<PaymentProviderResult> {
    const transactionId = `ref_mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      success: true,
      transactionId,
      status: 'refunded'
    };
  }

  // Helper for generating signed mock webhook payloads for tests
  generateMockWebhookPayload(
    event: 'payment.captured' | 'payment.failed' | 'refund.processed' | 'order.paid',
    data: {
      bookingId: string;
      orderId?: string;
      paymentId?: string;
      amount?: number;
      currency?: string;
    }
  ): { body: string; signature: string } {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || this.defaultSecret;
    const paymentId = data.paymentId || `pay_mock_${Date.now()}`;
    const orderId = data.orderId || `order_mock_${Date.now()}`;
    const amountInPaise = Math.round((data.amount || 2400) * 100);

    const payload = {
      entity: 'event',
      account_id: 'acc_rentme_test',
      event,
      contains: ['payment'],
      payload: {
        payment: {
          entity: {
            id: paymentId,
            entity: 'payment',
            amount: amountInPaise,
            currency: data.currency || 'INR',
            status: event === 'payment.captured' ? 'captured' : event === 'payment.failed' ? 'failed' : 'refunded',
            order_id: orderId,
            notes: {
              bookingId: data.bookingId
            }
          }
        },
        order: {
          entity: {
            id: orderId,
            entity: 'order',
            amount: amountInPaise,
            currency: data.currency || 'INR',
            status: event === 'payment.captured' ? 'paid' : 'created',
            notes: {
              bookingId: data.bookingId
            }
          }
        }
      },
      created_at: Math.floor(Date.now() / 1000)
    };

    const body = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return { body, signature };
  }
}

export class RazorpayPaymentProvider implements PaymentProvider {
  public name = 'razorpay';
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;

  constructor(keyId: string, keySecret: string, webhookSecret?: string) {
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.webhookSecret = webhookSecret || '';
  }

  private request(method: string, path: string, data?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
      const payload = data ? JSON.stringify(data) : null;

      const req = https.request(
        {
          hostname: 'api.razorpay.com',
          port: 443,
          path: `/v1${path}`,
          method,
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
            ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
          }
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(parsed.error?.description || `Razorpay error ${res.statusCode}`));
              } else {
                resolve(parsed);
              }
            } catch (err) {
              reject(new Error(`Invalid JSON response from Razorpay: ${body}`));
            }
          });
        }
      );

      req.on('error', reject);
      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  async createOrder(params: PaymentOrderParams): Promise<PaymentOrderResult> {
    const amountInPaise = Math.round(params.amount * 100);
    const res = await this.request('POST', '/orders', {
      amount: amountInPaise,
      currency: params.currency || 'INR',
      receipt: `rcpt_${params.bookingId.substring(0, 30)}`,
      notes: {
        bookingId: params.bookingId,
        customerId: params.customerId,
        ...(params.notes || {})
      }
    });

    return {
      orderId: res.id,
      amount: params.amount,
      currency: res.currency,
      keyId: this.keyId,
      status: res.status
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string): PaymentWebhookVerification {
    if (!this.webhookSecret) {
      return { valid: false, error: 'Razorpay webhook secret not configured' };
    }

    try {
      const computed = crypto.createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
      if (signature !== computed) {
        return { valid: false, error: 'Invalid Razorpay webhook signature' };
      }

      const parsed = JSON.parse(rawBody);
      const eventType = parsed.event;
      const paymentEntity = parsed.payload?.payment?.entity || {};
      const orderEntity = parsed.payload?.order?.entity || {};

      const bookingId =
        paymentEntity.notes?.bookingId ||
        orderEntity.notes?.bookingId;

      return {
        valid: true,
        eventType,
        orderId: paymentEntity.order_id || orderEntity.id,
        paymentId: paymentEntity.id,
        amount: paymentEntity.amount ? paymentEntity.amount / 100 : undefined,
        currency: paymentEntity.currency || 'INR',
        bookingId,
        rawEvent: parsed
      };
    } catch (err: any) {
      return { valid: false, error: err.message };
    }
  }

  async charge(params: PaymentChargeParams): Promise<PaymentProviderResult> {
    if (!params.paymentId) {
      throw new Error('Razorpay charge requires paymentId');
    }
    const amountInPaise = Math.round(params.amount * 100);
    try {
      const res = await this.request('POST', `/payments/${params.paymentId}/capture`, {
        amount: amountInPaise,
        currency: params.currency || 'INR'
      });
      return {
        success: res.status === 'captured',
        transactionId: res.id,
        status: res.status === 'captured' ? 'captured' : 'failed'
      };
    } catch (err: any) {
      return {
        success: false,
        transactionId: params.paymentId,
        status: 'failed',
        errorMessage: err.message
      };
    }
  }

  async refund(params: PaymentRefundParams): Promise<PaymentProviderResult> {
    const amountInPaise = Math.round(params.amount * 100);
    try {
      const res = await this.request('POST', `/payments/${params.paymentId}/refund`, {
        amount: amountInPaise,
        notes: {
          reason: params.reason || 'Customer cancellation'
        }
      });
      return {
        success: true,
        transactionId: res.id,
        status: 'refunded'
      };
    } catch (err: any) {
      return {
        success: false,
        transactionId: params.paymentId,
        status: 'failed',
        errorMessage: err.message
      };
    }
  }
}

let activePaymentProvider: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (activePaymentProvider) {
    return activePaymentProvider;
  }

  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();

  if (keyId && keySecret) {
    activePaymentProvider = new RazorpayPaymentProvider(keyId, keySecret, webhookSecret);
  } else {
    activePaymentProvider = new MockPaymentProvider();
  }

  return activePaymentProvider;
}

export function setPaymentProvider(provider: PaymentProvider | null): void {
  activePaymentProvider = provider;
}
