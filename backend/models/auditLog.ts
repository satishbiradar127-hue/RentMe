import { BookingActorRole } from './booking';

export interface AuditLog {
  id: string;
  actorId: string;
  actorRole: BookingActorRole;
  action: string;
  targetType: string;
  targetId: string;
  payload?: Record<string, any>;
  ipAddress?: string;
  createdAt: string;
}
