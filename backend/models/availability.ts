export interface Availability {
  id: string;
  companionId: string;
  date: string; // YYYY-MM-DD
  isAvailable: boolean;
  slotTime?: string;
  createdAt: string;
}
