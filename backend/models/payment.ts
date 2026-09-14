export type PaymentStatus = 'pending' | 'captured' | 'refunded' | 'failed';

export interface Payment {
  id: string;
  bookingId: string;
  customerId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  providerTxId: string;
  providerOrderId?: string;
  createdAt: string;
  updatedAt?: string;
}
