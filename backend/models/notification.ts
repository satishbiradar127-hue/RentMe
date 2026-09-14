export type NotificationChannel = 'sms' | 'email' | 'in_app';
export type NotificationStatus = 'sent' | 'delivered' | 'failed';

export interface Notification {
  id: string;
  userId: string;
  channel: NotificationChannel;
  title: string;
  message: string;
  status: NotificationStatus;
  createdAt: string;
  readAt?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

