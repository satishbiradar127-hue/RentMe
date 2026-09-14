import {
  User,
  Profile,
  Companion,
  Experience,
  Availability,
  Booking,
  BookingEvent,
  Review,
  Report,
  Payment,
  Payout,
  Notification,
  AuditLog,
  BookingStatus,
  BookingActorRole,
  KycVerification,
  WebhookEvent
} from '../models';
import { getHyderabadSeedData } from './seedData';

export interface IDatabaseStore {
  // Users
  getUsers(): Promise<User[]>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByAuthId(authId: string): Promise<User | undefined>;
  createUser(user: User): Promise<User>;

  // Profiles
  getProfiles(): Promise<Profile[]>;
  getProfileByUserId(userId: string): Promise<Profile | undefined>;
  upsertProfile(profile: Profile): Promise<Profile>;

  // Companions
  getCompanions(): Promise<Companion[]>;
  getCompanionById(id: string): Promise<Companion | undefined>;
  upsertCompanion(companion: Companion): Promise<Companion>;

  // Experiences
  getExperiences(): Promise<Experience[]>;
  getExperiencesByCompanionId(companionId: string): Promise<Experience[]>;
  getExperienceById(id: string): Promise<Experience | undefined>;

  // Availability
  getAvailability(companionId: string): Promise<Availability[]>;
  isCompanionAvailable(companionId: string, date: string): Promise<boolean>;
  setAvailability(availability: Availability): Promise<Availability>;

  // Bookings
  getBookings(): Promise<Booking[]>;
  getBookingById(id: string): Promise<Booking | undefined>;
  createBooking(booking: Booking): Promise<Booking>;
  updateBooking(id: string, updates: Partial<Booking>): Promise<Booking | undefined>;

  // Booking Events
  getBookingEvents(bookingId: string): Promise<BookingEvent[]>;
  createBookingEvent(event: BookingEvent): Promise<BookingEvent>;

  // Reviews
  getReviews(companionId?: string): Promise<Review[]>;
  createReview(review: Review): Promise<Review>;

  // Reports
  getReports(): Promise<Report[]>;
  getReportById(id: string): Promise<Report | undefined>;
  createReport(report: Report): Promise<Report>;
  updateReport(id: string, updates: Partial<Report>): Promise<Report | undefined>;

  // Payments
  getPayments(): Promise<Payment[]>;
  getPaymentById(id: string): Promise<Payment | undefined>;
  getPaymentByBookingId(bookingId: string): Promise<Payment | undefined>;
  getPaymentByOrderId(orderId: string): Promise<Payment | undefined>;
  createPayment(payment: Payment): Promise<Payment>;
  updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | undefined>;

  // Payouts
  getPayouts(): Promise<Payout[]>;
  getPayoutById(id: string): Promise<Payout | undefined>;
  getPayoutByBookingId(bookingId: string): Promise<Payout | undefined>;
  createPayout(payout: Payout): Promise<Payout>;
  updatePayout(id: string, updates: Partial<Payout>): Promise<Payout | undefined>;

  // Webhook Events
  getWebhookEvent(id: string): Promise<WebhookEvent | undefined>;
  createWebhookEvent(event: WebhookEvent): Promise<WebhookEvent>;

  // Notifications
  getNotifications(userId?: string): Promise<Notification[]>;
  getNotificationById(id: string): Promise<Notification | undefined>;
  getNotificationByIdempotencyKey(key: string): Promise<Notification | undefined>;
  createNotification(notification: Notification): Promise<Notification>;
  updateNotification(id: string, updates: Partial<Notification>): Promise<Notification | undefined>;

  // Audit Logs
  getAuditLogs(): Promise<AuditLog[]>;
  createAuditLog(log: AuditLog): Promise<AuditLog>;

  // KYC Verifications
  getKycVerifications(): Promise<KycVerification[]>;
  getKycVerificationById(id: string): Promise<KycVerification | undefined>;
  getKycVerificationsByUserId(userId: string): Promise<KycVerification[]>;
  createKycVerification(verification: KycVerification): Promise<KycVerification>;
  updateKycVerification(id: string, updates: Partial<KycVerification>): Promise<KycVerification | undefined>;

  // Reset demo / seed data
  reset(): Promise<void>;
}

export class MemoryStore implements IDatabaseStore {
  private users: Map<string, User> = new Map();
  private profiles: Map<string, Profile> = new Map();
  private companions: Map<string, Companion> = new Map();
  private experiences: Map<string, Experience> = new Map();
  private availability: Map<string, Availability> = new Map();
  private bookings: Map<string, Booking> = new Map();
  private bookingEvents: Map<string, BookingEvent> = new Map();
  private reviews: Map<string, Review> = new Map();
  private reports: Map<string, Report> = new Map();
  private payments: Map<string, Payment> = new Map();
  private payouts: Map<string, Payout> = new Map();
  private notifications: Map<string, Notification> = new Map();
  private auditLogs: Map<string, AuditLog> = new Map();
  private kycVerifications: Map<string, KycVerification> = new Map();
  private webhookEvents: Map<string, WebhookEvent> = new Map();

  constructor() {
    this.seed();
  }

  public seed(): void {
    this.users.clear();
    this.profiles.clear();
    this.companions.clear();
    this.experiences.clear();
    this.availability.clear();
    this.bookings.clear();
    this.bookingEvents.clear();
    this.reviews.clear();
    this.reports.clear();
    this.payments.clear();
    this.payouts.clear();
    this.notifications.clear();
    this.auditLogs.clear();
    this.kycVerifications.clear();
    this.webhookEvents.clear();

    const data = getHyderabadSeedData();

    for (const u of data.users) this.users.set(u.id, u);
    for (const p of data.profiles) this.profiles.set(p.id, p);
    for (const c of data.companions) this.companions.set(c.id, c);
    for (const exp of data.experiences) this.experiences.set(exp.id, exp);
    for (const a of data.availability) this.availability.set(a.id, a);
    for (const b of data.bookings) this.bookings.set(b.id, b);
    for (const be of data.bookingEvents) this.bookingEvents.set(be.id, be);
    for (const al of data.auditLogs) this.auditLogs.set(al.id, al);
  }

  // Users
  async getUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getUserById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  async getUserByAuthId(authId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((u) => u.authId === authId);
  }

  async createUser(user: User): Promise<User> {
    this.users.set(user.id, user);
    return user;
  }

  // Profiles
  async getProfiles(): Promise<Profile[]> {
    return Array.from(this.profiles.values());
  }

  async getProfileByUserId(userId: string): Promise<Profile | undefined> {
    return Array.from(this.profiles.values()).find((p) => p.userId === userId);
  }

  async upsertProfile(profile: Profile): Promise<Profile> {
    this.profiles.set(profile.id, profile);
    return profile;
  }

  // Companions
  async getCompanions(): Promise<Companion[]> {
    return Array.from(this.companions.values());
  }

  async getCompanionById(id: string): Promise<Companion | undefined> {
    return this.companions.get(id);
  }

  async upsertCompanion(companion: Companion): Promise<Companion> {
    this.companions.set(companion.id, companion);
    return companion;
  }

  // Experiences
  async getExperiences(): Promise<Experience[]> {
    return Array.from(this.experiences.values());
  }

  async getExperiencesByCompanionId(companionId: string): Promise<Experience[]> {
    return Array.from(this.experiences.values()).filter((e) => e.companionId === companionId);
  }

  async getExperienceById(id: string): Promise<Experience | undefined> {
    return this.experiences.get(id);
  }

  // Availability
  async getAvailability(companionId: string): Promise<Availability[]> {
    return Array.from(this.availability.values()).filter((a) => a.companionId === companionId && a.isAvailable);
  }

  async isCompanionAvailable(companionId: string, date: string): Promise<boolean> {
    const record = Array.from(this.availability.values()).find(
      (a) => a.companionId === companionId && a.date === date
    );
    return !!record && record.isAvailable;
  }

  async setAvailability(availability: Availability): Promise<Availability> {
    this.availability.set(availability.id, availability);
    return availability;
  }

  // Bookings
  async getBookings(): Promise<Booking[]> {
    return Array.from(this.bookings.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getBookingById(id: string): Promise<Booking | undefined> {
    return this.bookings.get(id);
  }

  async createBooking(booking: Booking): Promise<Booking> {
    this.bookings.set(booking.id, booking);
    return booking;
  }

  async updateBooking(id: string, updates: Partial<Booking>): Promise<Booking | undefined> {
    const existing = this.bookings.get(id);
    if (!existing) return undefined;
    const updated: Booking = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.bookings.set(id, updated);
    return updated;
  }

  // Booking Events
  async getBookingEvents(bookingId: string): Promise<BookingEvent[]> {
    return Array.from(this.bookingEvents.values())
      .filter((e) => e.bookingId === bookingId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  async createBookingEvent(event: BookingEvent): Promise<BookingEvent> {
    this.bookingEvents.set(event.id, event);
    return event;
  }

  // Reviews
  async getReviews(companionId?: string): Promise<Review[]> {
    const all = Array.from(this.reviews.values());
    if (companionId) return all.filter((r) => r.companionId === companionId);
    return all;
  }

  async createReview(review: Review): Promise<Review> {
    this.reviews.set(review.id, review);
    return review;
  }

  // Reports
  async getReports(): Promise<Report[]> {
    return Array.from(this.reports.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getReportById(id: string): Promise<Report | undefined> {
    return this.reports.get(id);
  }

  async createReport(report: Report): Promise<Report> {
    this.reports.set(report.id, report);
    return report;
  }

  async updateReport(id: string, updates: Partial<Report>): Promise<Report | undefined> {
    const existing = this.reports.get(id);
    if (!existing) return undefined;
    const updated: Report = {
      ...existing,
      ...updates
    };
    this.reports.set(id, updated);
    return updated;
  }

  // Payments
  async getPayments(): Promise<Payment[]> {
    return Array.from(this.payments.values());
  }

  async getPaymentById(id: string): Promise<Payment | undefined> {
    return this.payments.get(id);
  }

  async getPaymentByBookingId(bookingId: string): Promise<Payment | undefined> {
    return Array.from(this.payments.values()).find((p) => p.bookingId === bookingId);
  }

  async getPaymentByOrderId(orderId: string): Promise<Payment | undefined> {
    return Array.from(this.payments.values()).find(
      (p) => p.providerOrderId === orderId || p.providerTxId === orderId
    );
  }

  async createPayment(payment: Payment): Promise<Payment> {
    this.payments.set(payment.id, payment);
    return payment;
  }

  async updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | undefined> {
    const existing = this.payments.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    this.payments.set(id, updated);
    return updated;
  }

  // Payouts
  async getPayouts(): Promise<Payout[]> {
    return Array.from(this.payouts.values());
  }

  async getPayoutById(id: string): Promise<Payout | undefined> {
    return this.payouts.get(id);
  }

  async getPayoutByBookingId(bookingId: string): Promise<Payout | undefined> {
    return Array.from(this.payouts.values()).find((p) => p.bookingId === bookingId);
  }

  async createPayout(payout: Payout): Promise<Payout> {
    this.payouts.set(payout.id, payout);
    return payout;
  }

  async updatePayout(id: string, updates: Partial<Payout>): Promise<Payout | undefined> {
    const existing = this.payouts.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.payouts.set(id, updated);
    return updated;
  }

  // Webhook Events
  async getWebhookEvent(id: string): Promise<WebhookEvent | undefined> {
    return this.webhookEvents.get(id);
  }

  async createWebhookEvent(event: WebhookEvent): Promise<WebhookEvent> {
    this.webhookEvents.set(event.id, event);
    return event;
  }

  // Notifications
  async getNotifications(userId?: string): Promise<Notification[]> {
    const all = Array.from(this.notifications.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (userId) return all.filter((n) => n.userId === userId);
    return all;
  }

  async getNotificationById(id: string): Promise<Notification | undefined> {
    return this.notifications.get(id);
  }

  async getNotificationByIdempotencyKey(key: string): Promise<Notification | undefined> {
    for (const n of this.notifications.values()) {
      if (n.idempotencyKey && n.idempotencyKey === key) {
        return n;
      }
    }
    return undefined;
  }

  async createNotification(notification: Notification): Promise<Notification> {
    this.notifications.set(notification.id, notification);
    return notification;
  }

  async updateNotification(id: string, updates: Partial<Notification>): Promise<Notification | undefined> {
    const existing = this.notifications.get(id);
    if (!existing) return undefined;
    const updated: Notification = { ...existing, ...updates };
    this.notifications.set(id, updated);
    return updated;
  }

  // Audit Logs
  async getAuditLogs(): Promise<AuditLog[]> {
    return Array.from(this.auditLogs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async createAuditLog(log: AuditLog): Promise<AuditLog> {
    this.auditLogs.set(log.id, log);
    return log;
  }

  // KYC Verifications
  async getKycVerifications(): Promise<KycVerification[]> {
    return Array.from(this.kycVerifications.values()).sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
  }

  async getKycVerificationById(id: string): Promise<KycVerification | undefined> {
    return this.kycVerifications.get(id);
  }

  async getKycVerificationsByUserId(userId: string): Promise<KycVerification[]> {
    return Array.from(this.kycVerifications.values()).filter((v) => v.userId === userId);
  }

  async createKycVerification(verification: KycVerification): Promise<KycVerification> {
    this.kycVerifications.set(verification.id, verification);
    return verification;
  }

  async updateKycVerification(id: string, updates: Partial<KycVerification>): Promise<KycVerification | undefined> {
    const existing = this.kycVerifications.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    this.kycVerifications.set(id, updated);
    return updated;
  }

  async reset(): Promise<void> {
    this.seed();
  }
}
