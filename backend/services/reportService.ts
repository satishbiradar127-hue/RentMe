import { getDatabase } from '../db/database';
import { Report, ReportCategory, ReportStatus } from '../models';
import { getNotificationService, NotificationService } from './notificationService';

export interface CreateReportInput {
  reporterUserId: string;
  reportedUserId?: string;
  bookingId?: string;
  category: ReportCategory;
  description: string;
}

export class ReportService {
  private get db() {
    return getDatabase();
  }

  private get notificationService(): NotificationService {
    return getNotificationService();
  }

  async listReports(): Promise<Report[]> {
    return this.db.getReports();
  }

  async getReportById(id: string): Promise<Report | null> {
    const report = await this.db.getReportById(id);
    return report || null;
  }

  async createReport(input: CreateReportInput): Promise<Report> {
    const reportId = `rep-${Date.now()}`;
    const now = new Date().toISOString();

    const reporter = await this.db.getUserById(input.reporterUserId);
    if (!reporter) {
      await this.db.createUser({
        id: input.reporterUserId,
        email: `${input.reporterUserId}@rentme.local`,
        role: 'customer',
        name: input.reporterUserId,
        createdAt: now,
        updatedAt: now
      });
    }

    const report: Report = {
      id: reportId,
      reporterUserId: input.reporterUserId,
      reportedUserId: input.reportedUserId,
      bookingId: input.bookingId,
      category: input.category,
      description: input.description.trim(),
      status: 'open',
      createdAt: now
    };

    await this.db.createReport(report);

    await this.db.createAuditLog({
      id: `audit-${Date.now()}`,
      actorId: input.reporterUserId,
      actorRole: 'customer',
      action: 'REPORT_SUBMITTED',
      targetType: 'REPORT',
      targetId: reportId,
      payload: { category: input.category, bookingId: input.bookingId },
      createdAt: now
    });

    // Send safety notifications (in-app, SMS alert to admin, receipt to reporter)
    await this.notificationService.notifySafetyAlert(report, 'submitted');

    return report;
  }

  async resolveReport(id: string, resolutionNotes: string, adminUserId: string = 'admin'): Promise<Report> {
    const report = await this.db.getReportById(id);
    if (!report) {
      throw new Error(`Report "${id}" not found.`);
    }

    const now = new Date().toISOString();
    const updated = await this.db.updateReport(id, {
      status: 'resolved' as ReportStatus,
      resolutionNotes: resolutionNotes.trim(),
      resolvedAt: now
    });

    if (!updated) {
      throw new Error(`Failed to resolve report "${id}".`);
    }

    await this.db.createAuditLog({
      id: `audit-${Date.now()}`,
      actorId: adminUserId,
      actorRole: 'admin',
      action: 'REPORT_RESOLVED',
      targetType: 'REPORT',
      targetId: id,
      payload: { resolutionNotes },
      createdAt: now
    });

    // Send safety resolution notification
    await this.notificationService.notifySafetyAlert(updated, 'resolved');

    return updated;
  }
}

