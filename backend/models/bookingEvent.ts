import { BookingActorRole, BookingStatus } from './booking';

export interface BookingEvent {
  id: string;
  bookingId: string;
  fromStatus: BookingStatus;
  toStatus: BookingStatus;
  actorRole: BookingActorRole;
  actorId: string;
  notes?: string;
  timestamp: string;
}
