import { getDatabase } from '../db/database';
import { Notification, NotificationChannel, NotificationStatus, Booking, Report } from '../models';
import {
  getEmailProvider,
  getSmsProvider,
  EmailProvider,
  SmsProvider
} from '../providers/notificationProvider';

export interface SendNotificationOptions {
  userId: string;
  channel: NotificationChannel;
  title: string;
  message: string;
  recipientAddress?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

export class NotificationService {
  private get db() {
    return getDatabase();
  }

  private get emailProvider(): EmailProvider {
    return getEmailProvider();
  }

  private get smsProvider(): SmsProvider {
    return getSmsProvider();
  }

  async send(options: SendNotificationOptions): Promise<Notification> {
    const { userId, channel, title, message, recipientAddress, idempotencyKey, metadata } = options;

    // 1. Idempotency Check: if idempotencyKey is supplied and already recorded, return existing
    if (idempotencyKey) {
      const existing = await this.db.getNotificationByIdempotencyKey(idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    let status: NotificationStatus = 'sent';

    // 2. Dispatch via external provider boundary if email or sms
    if (channel === 'email') {
      const emailTo = recipientAddress || (await this.resolveUserEmail(userId));
      const emailRes = await this.emailProvider.sendEmail({
        to: emailTo,
        subject: title,
        body: message,
        idempotencyKey
      });
      status = emailRes.success ? 'delivered' : 'failed';
    } else if (channel === 'sms') {
      const smsTo = recipientAddress || (await this.resolveUserPhone(userId));
      const smsRes = await this.smsProvider.sendSms({
        to: smsTo,
        message: `${title}: ${message}`,
        idempotencyKey
      });
      status = smsRes.success ? 'delivered' : 'failed';
    } else {
      // in_app notifications are immediately marked as delivered
      status = 'delivered';
    }

    // 3. Ensure user exists in users table before writing notification to satisfy FK constraint
    await this.ensureUserExists(userId);

    // 4. Save notification record
    const record: Notification = {
      id,
      userId,
      channel,
      title,
      message,
      status,
      createdAt: now,
      idempotencyKey,
      metadata
    };

    return this.db.createNotification(record);
  }

  // --- Specialized Lifecycle Notification Helpers ---

  async notifyBookingEvent(
    event: 'requested' | 'accepted' | 'confirmed' | 'started' | 'completed' | 'cancelled' | 'refunded' | 'payout',
    booking: Booking,
    extra?: Record<string, any>
  ): Promise<Notification[]> {
    const notifications: Notification[] = [];
    const companion = await this.db.getCompanionById(booking.companionId);
    const companionUserId = companion?.userId || booking.companionId;
    const customerUserId = booking.customerId;

    switch (event) {
      case 'requested': {
        // To companion (in_app & SMS)
        const compNotif = await this.send({
          userId: companionUserId,
          channel: 'in_app',
          title: 'New Booking Request',
          message: `Booking request from ${booking.customerName} for ${booking.date} (₹${booking.totalPrice.toLocaleString()}).`,
          idempotencyKey: `booking_${booking.id}_requested_companion_inapp`,
          metadata: { bookingId: booking.id, event }
        });
        notifications.push(compNotif);

        await this.send({
          userId: companionUserId,
          channel: 'sms',
          title: 'RentMe Booking Request',
          message: `New booking request from ${booking.customerName} for ${booking.date}. Review in dashboard.`,
          idempotencyKey: `booking_${booking.id}_requested_companion_sms`,
          metadata: { bookingId: booking.id, event }
        });

        // To customer (in_app & email)
        const custNotif = await this.send({
          userId: customerUserId,
          channel: 'in_app',
          title: 'Booking Request Submitted',
          message: `Your booking request for ${booking.date} with ${companion?.name || 'companion'} has been sent.`,
          idempotencyKey: `booking_${booking.id}_requested_customer_inapp`,
          metadata: { bookingId: booking.id, event }
        });
        notifications.push(custNotif);
        break;
      }

      case 'accepted': {
        // To customer (in_app & email)
        const custNotif = await this.send({
          userId: customerUserId,
          channel: 'in_app',
          title: 'Booking Accepted!',
          message: `${companion?.name || 'Your companion'} accepted your booking for ${booking.date}. Complete payment to confirm.`,
          idempotencyKey: `booking_${booking.id}_accepted_customer_inapp`,
          metadata: { bookingId: booking.id, event }
        });
        notifications.push(custNotif);

        await this.send({
          userId: customerUserId,
          channel: 'email',
          title: 'RentMe: Booking Accepted - Payment Required',
          message: `Hello ${booking.customerName}, your booking with ${companion?.name || 'your companion'} was accepted. Total: ₹${booking.totalPrice}. Please complete payment in your portal to lock in your date.`,
          idempotencyKey: `booking_${booking.id}_accepted_customer_email`,
          metadata: { bookingId: booking.id, event }
        });
        break;
      }

      case 'confirmed': {
        // To customer
        const custNotif = await this.send({
          userId: customerUserId,
          channel: 'in_app',
          title: 'Booking Confirmed!',
          message: `Payment received for ${booking.date}. Your Hyderabad companion experience is confirmed.`,
          idempotencyKey: `booking_${booking.id}_confirmed_customer_inapp`,
          metadata: { bookingId: booking.id, event }
        });
        notifications.push(custNotif);

        await this.send({
          userId: customerUserId,
          channel: 'email',
          title: 'RentMe: Trip Confirmed!',
          message: `Your payment of ₹${booking.totalPrice} has been confirmed for ${booking.date}. See you soon!`,
          idempotencyKey: `booking_${booking.id}_confirmed_customer_email`,
          metadata: { bookingId: booking.id, event }
        });

        // To companion
        const compNotif = await this.send({
          userId: companionUserId,
          channel: 'in_app',
          title: 'Trip Confirmed & Paid',
          message: `${booking.customerName} has confirmed and paid for the trip on ${booking.date}.`,
          idempotencyKey: `booking_${booking.id}_confirmed_companion_inapp`,
          metadata: { bookingId: booking.id, event }
        });
        notifications.push(compNotif);

        await this.send({
          userId: companionUserId,
          channel: 'sms',
          title: 'RentMe Trip Confirmed',
          message: `Payment secured for trip on ${booking.date} with ${booking.customerName}.`,
          idempotencyKey: `booking_${booking.id}_confirmed_companion_sms`,
          metadata: { bookingId: booking.id, event }
        });
        break;
      }

      case 'started': {
        // Customer
        const custNotif = await this.send({
          userId: customerUserId,
          channel: 'in_app',
          title: 'Trip In Progress',
          message: `Your experience with ${companion?.name || 'your companion'} has started. Safe companionship protocols active.`,
          idempotencyKey: `booking_${booking.id}_started_customer_inapp`,
          metadata: { bookingId: booking.id, event }
        });
        notifications.push(custNotif);

        // Companion
        const compNotif = await this.send({
          userId: companionUserId,
          channel: 'in_app',
          title: 'Trip Started',
          message: `Trip with ${booking.customerName} is now in progress.`,
          idempotencyKey: `booking_${booking.id}_started_companion_inapp`,
          metadata: { bookingId: booking.id, event }
        });
        notifications.push(compNotif);
        break;
      }

      case 'completed': {
        // Customer
        const custNotif = await this.send({
          userId: customerUserId,
          channel: 'in_app',
          title: 'Trip Completed',
          message: `Hope you enjoyed your experience with ${companion?.name}! Please leave a rating and review.`,
          idempotencyKey: `booking_${booking.id}_completed_customer_inapp`,
          metadata: { bookingId: booking.id, event }
        });
        notifications.push(custNotif);

        await this.send({
          userId: customerUserId,
          channel: 'email',
          title: 'RentMe: Rate your experience with ' + (companion?.name || 'your companion'),
          message: `Your trip on ${booking.date} is complete. We value your feedback - please rate your experience.`,
          idempotencyKey: `booking_${booking.id}_completed_customer_email`,
          metadata: { bookingId: booking.id, event }
        });

        // Companion
        const compNotif = await this.send({
          userId: companionUserId,
          channel: 'in_app',
          title: 'Trip Completed',
          message: `Trip with ${booking.customerName} completed. Payout release is being verified.`,
          idempotencyKey: `booking_${booking.id}_completed_companion_inapp`,
          metadata: { bookingId: booking.id, event }
        });
        notifications.push(compNotif);
        break;
      }

      case 'cancelled': {
        const cancelledBy = booking.cancelledBy || 'system';
        const custNotif = await this.send({
          userId: customerUserId,
          channel: 'in_app',
          title: 'Booking Cancelled',
          message: `Booking for ${booking.date} was cancelled by ${cancelledBy}.`,
          idempotencyKey: `booking_${booking.id}_cancelled_customer_inapp`,
          metadata: { bookingId: booking.id, event, cancelledBy }
        });
        notifications.push(custNotif);

        const compNotif = await this.send({
          userId: companionUserId,
          channel: 'in_app',
          title: 'Booking Cancelled',
          message: `Booking for ${booking.date} was cancelled by ${cancelledBy}.`,
          idempotencyKey: `booking_${booking.id}_cancelled_companion_inapp`,
          metadata: { bookingId: booking.id, event, cancelledBy }
        });
        notifications.push(compNotif);
        break;
      }

      case 'refunded': {
        const refundAmount = extra?.refundAmount || booking.totalPrice;
        const custNotif = await this.send({
          userId: customerUserId,
          channel: 'in_app',
          title: 'Refund Processed',
          message: `A refund of ₹${refundAmount} has been processed for booking ${booking.id}.`,
          idempotencyKey: `booking_${booking.id}_refunded_customer_inapp`,
          metadata: { bookingId: booking.id, event, refundAmount }
        });
        notifications.push(custNotif);

        await this.send({
          userId: customerUserId,
          channel: 'email',
          title: 'RentMe: Refund Confirmation',
          message: `Your refund of ₹${refundAmount} for booking ${booking.id} has been initiated.`,
          idempotencyKey: `booking_${booking.id}_refunded_customer_email`,
          metadata: { bookingId: booking.id, event, refundAmount }
        });
        break;
      }

      case 'payout': {
        const payoutAmount = extra?.payoutAmount || Math.round(booking.totalPrice * 0.85);
        const compNotif = await this.send({
          userId: companionUserId,
          channel: 'in_app',
          title: 'Payout Released',
          message: `Escrow payout of ₹${payoutAmount} for booking ${booking.id} has been released.`,
          idempotencyKey: `booking_${booking.id}_payout_companion_inapp`,
          metadata: { bookingId: booking.id, event, payoutAmount }
        });
        notifications.push(compNotif);

        await this.send({
          userId: companionUserId,
          channel: 'sms',
          title: 'RentMe Payout Released',
          message: `Escrow payout of ₹${payoutAmount} for booking ${booking.id} has been transferred.`,
          idempotencyKey: `booking_${booking.id}_payout_companion_sms`,
          metadata: { bookingId: booking.id, event, payoutAmount }
        });
        break;
      }
    }

    return notifications;
  }

  async notifyKycStatus(
    userId: string,
    status: 'submitted' | 'verified' | 'rejected' | string,
    details?: { rejectionReason?: string; documentType?: string }
  ): Promise<Notification[]> {
    const notifications: Notification[] = [];
    const dedupSuffix = `${status}_${Date.now()}`;

    let title = 'KYC Verification Update';
    let message = `Your KYC verification status is now: ${status}.`;

    if (status === 'submitted') {
      title = 'KYC Documents Submitted';
      message = 'Your identity documents have been submitted for verification.';
    } else if (status === 'verified') {
      title = 'KYC Verification Approved!';
      message = 'Congratulations! Your profile is now ID Verified and eligible for bookings.';
    } else if (status === 'rejected') {
      title = 'KYC Verification Action Required';
      message = `Verification was not approved: ${details?.rejectionReason || 'Please resubmit valid government ID'}.`;
    }

    const inApp = await this.send({
      userId,
      channel: 'in_app',
      title,
      message,
      idempotencyKey: `kyc_${userId}_${dedupSuffix}_inapp`,
      metadata: { status, ...details }
    });
    notifications.push(inApp);

    await this.send({
      userId,
      channel: 'email',
      title: `RentMe: ${title}`,
      message,
      idempotencyKey: `kyc_${userId}_${dedupSuffix}_email`,
      metadata: { status, ...details }
    });

    return notifications;
  }

  async notifySafetyAlert(report: Report, action: 'submitted' | 'resolved'): Promise<Notification[]> {
    const notifications: Notification[] = [];
    const adminUserId = 'user-admin';

    if (action === 'submitted') {
      // Alert Ops Admin
      const adminNotif = await this.send({
        userId: adminUserId,
        channel: 'in_app',
        title: `URGENT Safety Report: [${report.category.toUpperCase()}]`,
        message: `New incident filed: "${report.description.substring(0, 100)}...". Booking: ${report.bookingId || 'N/A'}.`,
        idempotencyKey: `report_${report.id}_submitted_admin_inapp`,
        metadata: { reportId: report.id, category: report.category }
      });
      notifications.push(adminNotif);

      await this.send({
        userId: adminUserId,
        channel: 'sms',
        title: 'RentMe Safety Alert',
        message: `Urgent incident report ${report.id} filed (${report.category}). Please review dashboard immediately.`,
        idempotencyKey: `report_${report.id}_submitted_admin_sms`,
        metadata: { reportId: report.id }
      });

      // Confirm to reporter
      const reporterNotif = await this.send({
        userId: report.reporterUserId,
        channel: 'in_app',
        title: 'Safety Incident Report Received',
        message: 'Your report has been logged with Trust & Safety. Our team will review it promptly.',
        idempotencyKey: `report_${report.id}_submitted_reporter_inapp`,
        metadata: { reportId: report.id }
      });
      notifications.push(reporterNotif);
    } else if (action === 'resolved') {
      const reporterNotif = await this.send({
        userId: report.reporterUserId,
        channel: 'in_app',
        title: 'Safety Report Resolved',
        message: `Your report ${report.id} has been resolved by our Trust & Safety team. Resolution: ${report.resolutionNotes || 'Case reviewed.'}`,
        idempotencyKey: `report_${report.id}_resolved_reporter_inapp`,
        metadata: { reportId: report.id }
      });
      notifications.push(reporterNotif);
    }

    return notifications;
  }

  // --- Query and Management ---

  async getUserNotifications(userId: string): Promise<Notification[]> {
    let notifications = await this.db.getNotifications(userId);
    if (notifications.length === 0) {
      // Check if userId is a companion ID (or linked companion user)
      const companions = await this.db.getCompanions();
      const matched = companions.find((c) => c.id === userId || c.userId === userId);
      if (matched) {
        const altId = matched.id === userId ? matched.userId : matched.id;
        if (altId) {
          const altNotifications = await this.db.getNotifications(altId);
          if (altNotifications.length > 0) {
            return altNotifications;
          }
        }
      }
    }
    return notifications;
  }


  async markAsRead(notificationId: string): Promise<Notification | null> {
    const now = new Date().toISOString();
    const updated = await this.db.updateNotification(notificationId, { readAt: now });
    return updated || null;
  }

  // --- Internal Helpers ---

  private async resolveUserEmail(userId: string): Promise<string> {
    const user = await this.db.getUserById(userId);
    return user?.email || `${userId}@rentme.local`;
  }

  private async resolveUserPhone(userId: string): Promise<string> {
    const user = await this.db.getUserById(userId);
    return user?.phone || '+919876543210';
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const existing = await this.db.getUserById(userId);
    if (!existing) {
      const now = new Date().toISOString();
      await this.db.createUser({
        id: userId,
        email: `${userId}@rentme.local`,
        name: userId,
        role: userId.includes('admin') ? 'admin' : userId.includes('comp') ? 'companion' : 'customer',
        createdAt: now,
        updatedAt: now
      });
    }
  }
}

let notificationServiceInstance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new NotificationService();
  }
  return notificationServiceInstance;
}
