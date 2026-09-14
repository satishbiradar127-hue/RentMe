export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Payout {
  id: string;
  companionId: string;
  bookingId: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  providerTxId: string;
  createdAt: string;
}
