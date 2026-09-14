import * as https from 'node:https';

export interface PayoutParams {
  companionId: string;
  bookingId: string;
  amount: number;
  currency: string;
  payoutMethod?: 'bank_transfer' | 'upi';
}

export interface PayoutResult {
  success: boolean;
  payoutId: string;
  status: 'completed' | 'processing' | 'failed';
  errorMessage?: string;
}

export interface PayoutEligibilityResult {
  eligible: boolean;
  reason?: string;
  bookingId: string;
  companionId?: string;
  totalAmount?: number;
  platformFeeRate?: number;
  platformFee?: number;
  netPayoutAmount?: number;
  currency?: string;
}

export interface PayoutProvider {
  name: string;
  checkEligibility(booking: any, payment?: any, hasOpenDisputes?: boolean): PayoutEligibilityResult;
  createPayout(params: PayoutParams): Promise<PayoutResult>;
}

export class MockPayoutProvider implements PayoutProvider {
  public name = 'mock';

  checkEligibility(booking: any, payment?: any, hasOpenDisputes: boolean = false): PayoutEligibilityResult {
    const bookingId = booking?.id || '';
    const companionId = booking?.companionId || '';
    const totalPrice = Number(booking?.totalPrice || 0);
    const currency = booking?.currency || 'INR';

    if (!booking) {
      return { eligible: false, reason: 'Booking not found', bookingId };
    }

    // Escrow rule 1: Booking must be in completed status (never release on booking confirmation or in progress)
    if (booking.status !== 'completed' && booking.status !== 'reviewed') {
      return {
        eligible: false,
        reason: `Companion payout is not eligible: booking status is "${booking.status}". Trip must be completed before payout can be released.`,
        bookingId,
        companionId,
        totalAmount: totalPrice,
        currency
      };
    }

    // Escrow rule 2: Payment must be captured and not refunded
    if (!payment || payment.status !== 'captured') {
      return {
        eligible: false,
        reason: `Companion payout is not eligible: payment status is "${payment?.status || 'missing'}". Valid captured customer payment is required.`,
        bookingId,
        companionId,
        totalAmount: totalPrice,
        currency
      };
    }

    // Escrow rule 3: Active disputes block payout
    if (hasOpenDisputes) {
      return {
        eligible: false,
        reason: 'Companion payout is held due to an open trust, safety, or dispute report.',
        bookingId,
        companionId,
        totalAmount: totalPrice,
        currency
      };
    }

    const platformFee = Math.round(totalPrice * 0.15);
    const netPayoutAmount = totalPrice - platformFee;

    return {
      eligible: true,
      bookingId,
      companionId,
      totalAmount: totalPrice,
      platformFeeRate: 0.15,
      platformFee,
      netPayoutAmount,
      currency
    };
  }

  async createPayout(params: PayoutParams): Promise<PayoutResult> {
    const payoutId = `pout_mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      success: true,
      payoutId,
      status: 'completed'
    };
  }
}

export class RazorpayPayoutProvider implements PayoutProvider {
  public name = 'razorpay';
  private keyId: string;
  private keySecret: string;

  constructor(keyId: string, keySecret: string) {
    this.keyId = keyId;
    this.keySecret = keySecret;
  }

  checkEligibility(booking: any, payment?: any, hasOpenDisputes: boolean = false): PayoutEligibilityResult {
    const mock = new MockPayoutProvider();
    return mock.checkEligibility(booking, payment, hasOpenDisputes);
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
                reject(new Error(parsed.error?.description || `Razorpay Route error ${res.statusCode}`));
              } else {
                resolve(parsed);
              }
            } catch (err) {
              reject(new Error(`Invalid JSON response from Razorpay Route: ${body}`));
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

  async createPayout(params: PayoutParams): Promise<PayoutResult> {
    try {
      const amountInPaise = Math.round(params.amount * 100);
      const res = await this.request('POST', '/transfers', {
        account: params.companionId,
        amount: amountInPaise,
        currency: params.currency || 'INR',
        notes: {
          bookingId: params.bookingId,
          payoutMethod: params.payoutMethod || 'bank_transfer'
        }
      });

      return {
        success: true,
        payoutId: res.id,
        status: res.status === 'processed' ? 'completed' : 'processing'
      };
    } catch (err: any) {
      return {
        success: false,
        payoutId: '',
        status: 'failed',
        errorMessage: err.message
      };
    }
  }
}

let activePayoutProvider: PayoutProvider | null = null;

export function getPayoutProvider(): PayoutProvider {
  if (activePayoutProvider) {
    return activePayoutProvider;
  }

  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  if (keyId && keySecret) {
    activePayoutProvider = new RazorpayPayoutProvider(keyId, keySecret);
  } else {
    activePayoutProvider = new MockPayoutProvider();
  }

  return activePayoutProvider;
}

export function setPayoutProvider(provider: PayoutProvider | null): void {
  activePayoutProvider = provider;
}
