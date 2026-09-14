export type ReportCategory = 'safety' | 'behavior' | 'payment' | 'no_show' | 'support' | 'other';
export type ReportStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';

export interface Report {
  id: string;
  reporterUserId: string;
  reportedUserId?: string;
  bookingId?: string;
  category: ReportCategory;
  description: string;
  status: ReportStatus;
  resolutionNotes?: string;
  resolvedAt?: string;
  createdAt: string;
}
