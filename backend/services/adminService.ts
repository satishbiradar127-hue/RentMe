import { getDatabase } from '../db/database';
import { Booking, Companion, Report, AuditLog } from '../models';

export interface AdminMetrics {
  totalCompanions: number;
  totalBookings: number;
  requestedBookings: number;
  acceptedBookings: number;
  confirmedBookings: number;
  inProgressBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  disputedBookings: number;
  totalGmv: number;
  openReports: number;
}

export interface AdminOverview {
  metrics: AdminMetrics;
  bookings: Booking[];
  companions: Companion[];
  reports: Report[];
  recentAuditLogs: AuditLog[];
}

export class AdminService {
  private get db() {
    return getDatabase();
  }

  async getMetrics(): Promise<AdminMetrics> {
    const companions = await this.db.getCompanions();
    const bookings = await this.db.getBookings();
    const reports = await this.db.getReports();

    const metrics: AdminMetrics = {
      totalCompanions: companions.length,
      totalBookings: bookings.length,
      requestedBookings: bookings.filter((b) => b.status === 'requested').length,
      acceptedBookings: bookings.filter((b) => b.status === 'accepted').length,
      confirmedBookings: bookings.filter((b) => b.status === 'confirmed').length,
      inProgressBookings: bookings.filter((b) => b.status === 'in_progress').length,
      completedBookings: bookings.filter((b) => b.status === 'completed' || b.status === 'reviewed').length,
      cancelledBookings: bookings.filter((b) => b.status === 'cancelled' || b.status === 'declined').length,
      disputedBookings: bookings.filter((b) => b.status === 'disputed').length,
      totalGmv: bookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0),
      openReports: reports.filter((r) => r.status === 'open' || r.status === 'investigating').length
    };

    return metrics;
  }

  async getOverview(): Promise<AdminOverview> {
    const metrics = await this.getMetrics();
    const bookings = await this.db.getBookings();
    const companions = await this.db.getCompanions();
    const reports = await this.db.getReports();
    const logs = await this.db.getAuditLogs();

    return {
      metrics,
      bookings,
      companions,
      reports,
      recentAuditLogs: logs.slice(0, 50)
    };
  }

  async resetSeedData(): Promise<void> {
    await this.db.reset();
  }
}
