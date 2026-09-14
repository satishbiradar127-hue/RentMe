export type BookingStatus =
  | 'requested'
  | 'accepted'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'reviewed'
  | 'declined'
  | 'cancelled'
  | 'no_show'
  | 'disputed';

export type BookingActorRole = 'customer' | 'companion' | 'admin' | 'system';

export interface Booking {
  id: string;
  customerId: string;
  companionId: string;
  experienceId: string;
  customerName: string;
  customerEmail: string;
  date: string;
  partySize: number;
  notes?: string;
  status: BookingStatus;
  totalPrice: number;
  currency: string;
  cancelledBy?: BookingActorRole;
  rating?: number;
  review?: string;
  createdAt: string;
  updatedAt: string;
}

export const VALID_BOOKING_STATUSES: readonly BookingStatus[] = [
  'requested',
  'accepted',
  'confirmed',
  'in_progress',
  'completed',
  'reviewed',
  'declined',
  'cancelled',
  'no_show',
  'disputed'
];

export const ALLOWED_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  requested: ['accepted', 'declined', 'cancelled'],
  accepted: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'cancelled', 'no_show', 'disputed'],
  in_progress: ['completed', 'disputed', 'no_show'],
  completed: ['reviewed', 'disputed'],
  reviewed: [],
  declined: [],
  cancelled: [],
  no_show: ['disputed'],
  disputed: []
};
