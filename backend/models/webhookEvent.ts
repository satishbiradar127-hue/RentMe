export interface WebhookEvent {
  id: string;
  eventType: string;
  provider: string;
  payload?: any;
  processedAt: string;
}
