import { getDatabase } from '../db/database';
import {
  Booking,
  BookingStatus,
  BookingActorRole,
  ALLOWED_TRANSITIONS,
  VALID_BOOKING_STATUSES,
  Payment,
  Payout
} from '../models';
import {
  getPaymentProvider,
  getPayoutProvider,
  PaymentProvider,
  PayoutProvider,
  MockNotificationProvider,
  PaymentOrderResult,
  PayoutEligibilityResult
} from '../providers';
import { getNotificationService, NotificationService } from './notificationService';


export interface CreateBookingInput {
  customerId?: string;
  customerName: string;
  customerEmail: string;
  companionId: string;
  experienceId: string;
  date: string;
  partySize: number;
  notes?: string;
}

export interface TransitionBookingInput {
  targetStatus: BookingStatus;
  actorRole: BookingActorRole;
  actorId?: string;
  cancelledBy?: BookingActorRole;
  rating?: number;
  review?: string;
  notes?: string;
  paymentId?: string;
  orderId?: string;
  signature?: string;
}

export class BookingService {
  private get db() {
    return getDatabase();
  }
  private get paymentProvider(): PaymentProvider {
    return getPaymentProvider();
  }
  private get payoutProvider(): PayoutProvider {
    return getPayoutProvider();
  }
  private get notificationService(): NotificationService {
    return getNotificationService();
  }
  private notificationProvider = new MockNotificationProvider();

  async getBookings(filter?: { companionId?: string; customerId?: string; status?: BookingStatus }): Promise<Booking[]> {
    let bookings = await this.db.getBookings();
    if (filter?.companionId) {
      bookings = bookings.filter((b) => b.companionId === filter.companionId);
    }
    if (filter?.customerId) {
      bookings = bookings.filter((b) => b.customerId === filter.customerId);
    }
    if (filter?.status) {
      bookings = bookings.filter((b) => b.status === filter.status);
    }
    return bookings;
  }

  async getBookingById(id: string): Promise<Booking | null> {
    const booking = await this.db.getBookingById(id);
    return booking || null;
  }

  async createBooking(input: CreateBookingInput, actorRole: BookingActorRole = 'customer', actorId?: string): Promise<Booking> {
    // 1. Validate companion
    const companion = await this.db.getCompanionById(input.companionId);
    if (!companion) {
      throw new Error(`Companion with ID "${input.companionId}" not found.`);
    }

    // Validate companion verification status
    const isVerified =
      companion.status === 'ID Verified' ||
      companion.status === 'verified' ||
      companion.verificationStatus === 'verified';
    if (!isVerified) {
      throw new Error(`Companion "${companion.name}" is not verified. Only verified companions are eligible for booking.`);
    }

    const experience = await this.db.getExperienceById(input.experienceId);
    if (!experience || experience.companionId !== companion.id) {
      throw new Error(`Experience with ID "${input.experienceId}" not found for this companion.`);
    }

    // 2. Validate availability
    const isAvailable = await this.db.isCompanionAvailable(input.companionId, input.date);
    if (!isAvailable) {
      throw new Error(`Companion ${companion.name} is not available on date ${input.date}.`);
    }

    // 3. Validate party size
    const partySize = Number(input.partySize);
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 4) {
      throw new Error('Party size must be an integer between 1 and 4.');
    }

    // 4. Validate customer fields
    if (!input.customerName || !input.customerName.trim()) {
      throw new Error('Customer name is required.');
    }
    if (!input.customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customerEmail.trim())) {
      throw new Error('Valid customer email is required.');
    }

    // 5. Calculate total
    const totalPrice = experience.price * partySize;
    const bookingId = `booking-${Date.now()}`;
    const now = new Date().toISOString();
    let customerId = input.customerId;
    if (!customerId && actorId && actorRole === 'customer') {
      customerId = actorId;
    }
    if (!customerId) {
      const existingUser = await this.db.getUserByEmail(input.customerEmail.trim());
      if (existingUser) {
        customerId = existingUser.id;
      } else {
        customerId = `cust-${Date.now()}`;
      }
    }

    // Ensure customer user and profile exist for PostgreSQL foreign key constraints
    const user = await this.db.getUserById(customerId);
    if (!user) {
      await this.db.createUser({
        id: customerId,
        email: input.customerEmail.trim(),
        role: 'customer',
        name: input.customerName.trim(),
        createdAt: now,
        updatedAt: now
      });
      await this.db.upsertProfile({
        id: `prof-${customerId}`,
        userId: customerId,
        displayName: input.customerName.trim(),
        city: 'Hyderabad, Telangana',
        idVerified: false,
        verificationStatus: 'unverified',
        createdAt: now,
        updatedAt: now
      });
    }

    const newBooking: Booking = {
      id: bookingId,
      customerId,
      companionId: input.companionId,
      experienceId: input.experienceId,
      customerName: input.customerName.trim(),
      customerEmail: input.customerEmail.trim(),
      date: input.date,
      partySize,
      notes: input.notes?.trim() || '',
      status: 'requested',
      totalPrice,
      currency: 'INR',
      createdAt: now,
      updatedAt: now
    };

    // Save booking
    await this.db.createBooking(newBooking);

    // Record lifecycle event
    await this.db.createBookingEvent({
      id: `evt-${bookingId}-${Date.now()}`,
      bookingId,
      fromStatus: 'requested',
      toStatus: 'requested',
      actorRole,
      actorId: actorId || customerId,
      notes: 'Initial booking request submitted',
      timestamp: now
    });

    // Record audit log
    await this.db.createAuditLog({
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      actorId: actorId || customerId,
      actorRole,
      action: 'BOOKING_CREATE',
      targetType: 'BOOKING',
      targetId: bookingId,
      payload: { experienceTitle: experience.title, totalPrice, date: input.date },
      createdAt: now
    });

    // Send multi-channel notifications (in-app, SMS, email)
    await this.notificationService.notifyBookingEvent('requested', newBooking);
    await this.notificationProvider.send({
      userId: companion.userId || companion.id,
      channel: 'sms',
      title: 'New Booking Request',
      message: `New booking request from ${input.customerName} for ${experience.title} on ${input.date}.`
    });

    return newBooking;
  }

  async createPaymentIntent(
    bookingId: string,
    actorRole: BookingActorRole,
    actorId?: string
  ): Promise<{ order: PaymentOrderResult; payment: Payment }> {
    const booking = await this.db.getBookingById(bookingId);
    if (!booking) {
      throw new Error(`Booking "${bookingId}" not found.`);
    }

    if (booking.status !== 'accepted') {
      throw new Error(
        `Payment order can only be created for accepted bookings. Current status is "${booking.status}".`
      );
    }

    if (actorRole !== 'admin' && actorRole !== 'customer') {
      throw new Error(`Role "${actorRole}" is not authorized to create payment intent.`);
    }

    if (actorRole === 'customer' && actorId && booking.customerId !== actorId) {
      throw new Error('Customer can only create payment intent for their own booking.');
    }

    const order = await this.paymentProvider.createOrder({
      bookingId: booking.id,
      customerId: booking.customerId,
      amount: booking.totalPrice,
      currency: booking.currency,
      notes: {
        bookingId: booking.id,
        companionId: booking.companionId,
        customerName: booking.customerName
      }
    });

    const now = new Date().toISOString();
    let payment = await this.db.getPaymentByBookingId(booking.id);

    if (payment) {
      payment =
        (await this.db.updatePayment(payment.id, {
          providerOrderId: order.orderId,
          providerTxId: order.orderId,
          status: 'pending'
        })) || payment;
    } else {
      payment = await this.db.createPayment({
        id: `pay-${Date.now()}`,
        bookingId: booking.id,
        customerId: booking.customerId,
        amount: booking.totalPrice,
        currency: booking.currency,
        status: 'pending',
        providerOrderId: order.orderId,
        providerTxId: order.orderId,
        createdAt: now
      });
    }

    await this.db.createAuditLog({
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      actorId: actorId || booking.customerId,
      actorRole,
      action: 'PAYMENT_ORDER_CREATED',
      targetType: 'PAYMENT',
      targetId: payment.id,
      payload: { orderId: order.orderId, amount: booking.totalPrice, currency: booking.currency },
      createdAt: now
    });

    return { order, payment };
  }

  async handlePaymentWebhook(
    rawBody: string,
    signature: string
  ): Promise<{ success: boolean; eventType: string; status: string; bookingId?: string; duplicate?: boolean }> {
    const verification = this.paymentProvider.verifyWebhookSignature(rawBody, signature);
    if (!verification.valid) {
      throw new Error(`Invalid webhook signature: ${verification.error || 'Verification failed'}`);
    }

    const rawEvent = verification.rawEvent || {};
    const eventId =
      rawEvent.id ||
      `${verification.eventType}_${verification.paymentId || verification.orderId || Date.now()}`;
    const eventType = verification.eventType || 'unknown';

    // Idempotency check:
    const existingEvent = await this.db.getWebhookEvent(eventId);
    if (existingEvent) {
      return {
        success: true,
        eventType,
        status: 'already_processed',
        bookingId: verification.bookingId,
        duplicate: true
      };
    }

    const now = new Date().toISOString();

    // Persist webhook event for idempotency
    await this.db.createWebhookEvent({
      id: eventId,
      eventType,
      provider: this.paymentProvider.name,
      payload: rawEvent,
      processedAt: now
    });

    let bookingId = verification.bookingId;
    let payment: Payment | undefined;

    if (verification.orderId) {
      payment = await this.db.getPaymentByOrderId(verification.orderId);
      if (payment && !bookingId) {
        bookingId = payment.bookingId;
      }
    }
    if (!payment && bookingId) {
      payment = await this.db.getPaymentByBookingId(bookingId);
    }

    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      if (payment) {
        await this.db.updatePayment(payment.id, {
          status: 'captured',
          providerTxId: verification.paymentId || payment.providerTxId
        });
      } else if (bookingId) {
        const booking = await this.db.getBookingById(bookingId);
        if (booking) {
          payment = await this.db.createPayment({
            id: `pay-${Date.now()}`,
            bookingId,
            customerId: booking.customerId,
            amount: verification.amount || booking.totalPrice,
            currency: verification.currency || booking.currency,
            status: 'captured',
            providerTxId: verification.paymentId || '',
            providerOrderId: verification.orderId,
            createdAt: now
          });
        }
      }

      if (bookingId) {
        const booking = await this.db.getBookingById(bookingId);
        if (booking && booking.status === 'accepted') {
          // Authoritative state machine transition: accepted -> confirmed!
          await this.transitionBooking(bookingId, {
            targetStatus: 'confirmed',
            actorRole: 'system',
            actorId: 'payment-webhook',
            notes: `Payment captured authoritatively via webhook (${verification.paymentId || 'captured'})`
          });
        }
      }

      await this.db.createAuditLog({
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        actorId: 'system',
        actorRole: 'system',
        action: 'PAYMENT_CAPTURED',
        targetType: 'PAYMENT',
        targetId: payment?.id || eventId,
        payload: { eventType, bookingId, paymentId: verification.paymentId, orderId: verification.orderId },
        createdAt: now
      });

      return { success: true, eventType, status: 'captured', bookingId };
    }

    if (eventType === 'payment.failed') {
      if (payment) {
        await this.db.updatePayment(payment.id, {
          status: 'failed',
          providerTxId: verification.paymentId || payment.providerTxId
        });
      }
      if (bookingId) {
        await this.db.createAuditLog({
          id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          actorId: 'system',
          actorRole: 'system',
          action: 'PAYMENT_FAILED',
          targetType: 'BOOKING',
          targetId: bookingId,
          payload: { eventType, paymentId: verification.paymentId, orderId: verification.orderId },
          createdAt: now
        });
      }
      return { success: true, eventType, status: 'failed', bookingId };
    }

    if (eventType === 'refund.processed') {
      if (payment) {
        await this.db.updatePayment(payment.id, {
          status: 'refunded'
        });
      }
      await this.db.createAuditLog({
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        actorId: 'system',
        actorRole: 'system',
        action: 'PAYMENT_REFUNDED',
        targetType: 'PAYMENT',
        targetId: payment?.id || eventId,
        payload: { eventType, bookingId },
        createdAt: now
      });
      return { success: true, eventType, status: 'refunded', bookingId };
    }

    return { success: true, eventType, status: 'acknowledged', bookingId };
  }

  async getPayoutEligibility(bookingId: string): Promise<PayoutEligibilityResult> {
    const booking = await this.db.getBookingById(bookingId);
    if (!booking) {
      return { eligible: false, reason: `Booking "${bookingId}" not found.`, bookingId };
    }

    const payment = await this.db.getPaymentByBookingId(bookingId);
    const reports = await this.db.getReports();
    const hasOpenDispute = reports.some(
      (r) => r.bookingId === bookingId && (r.status === 'open' || r.status === 'investigating')
    );

    return this.payoutProvider.checkEligibility(booking, payment, hasOpenDispute);
  }

  async transitionBooking(bookingId: string, input: TransitionBookingInput): Promise<Booking> {
    const booking = await this.db.getBookingById(bookingId);
    if (!booking) {
      throw new Error(`Booking "${bookingId}" not found.`);
    }

    const { targetStatus, actorRole } = input;
    const actorId = input.actorId || actorRole;

    if (!VALID_BOOKING_STATUSES.includes(targetStatus)) {
      throw new Error(`Invalid target status "${targetStatus}".`);
    }

    const allowed = ALLOWED_TRANSITIONS[booking.status] || [];
    if (!allowed.includes(targetStatus)) {
      throw new Error(
        `Cannot transition booking from "${booking.status}" to "${targetStatus}". Allowed next statuses: [${allowed.join(', ')}]`
      );
    }

    // Role boundary validation
    this.assertRolePermission(booking.status, targetStatus, actorRole);

    const now = new Date().toISOString();
    const updates: Partial<Booking> = {
      status: targetStatus,
      updatedAt: now
    };

    if (targetStatus === 'cancelled') {
      updates.cancelledBy = input.cancelledBy || actorRole;
    }

    if (targetStatus === 'reviewed' && input.rating) {
      updates.rating = input.rating;
      updates.review = input.review || 'Completed public Hyderabad experience.';
    }

    // Execute side-effects via providers
    if (targetStatus === 'confirmed') {
      let existingPayment = await this.db.getPaymentByBookingId(booking.id);
      if (existingPayment && existingPayment.status === 'captured') {
        // Payment was already authoritatively captured (e.g. by webhook)
      } else {
        const chargeResult = await this.paymentProvider.charge({
          bookingId: booking.id,
          customerId: booking.customerId,
          amount: booking.totalPrice,
          currency: booking.currency,
          orderId: input.orderId,
          paymentId: input.paymentId,
          signature: input.signature
        });

        if (!chargeResult.success || chargeResult.status !== 'captured') {
          throw new Error(chargeResult.errorMessage || 'Payment charge failed.');
        }

        if (existingPayment) {
          await this.db.updatePayment(existingPayment.id, {
            status: 'captured',
            providerTxId: chargeResult.transactionId
          });
        } else {
          await this.db.createPayment({
            id: `pay-${Date.now()}`,
            bookingId: booking.id,
            customerId: booking.customerId,
            amount: booking.totalPrice,
            currency: booking.currency,
            status: 'captured',
            providerTxId: chargeResult.transactionId,
            createdAt: now
          });
        }
      }
      // Escrow rule: NEVER release companion payout immediately upon confirmation!
    } else if (targetStatus === 'cancelled') {
      const existingPayment = await this.db.getPaymentByBookingId(booking.id);
      if (existingPayment && existingPayment.status === 'captured') {
        const refundResult = await this.paymentProvider.refund({
          paymentId: existingPayment.providerTxId || existingPayment.id,
          amount: existingPayment.amount,
          reason: `Cancelled by ${input.cancelledBy || actorRole}`
        });

        if (refundResult.success) {
          await this.db.updatePayment(existingPayment.id, { status: 'refunded' });

          await this.db.createAuditLog({
            id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            actorId,
            actorRole,
            action: 'PAYMENT_REFUNDED',
            targetType: 'PAYMENT',
            targetId: existingPayment.id,
            payload: { bookingId: booking.id, amount: existingPayment.amount, refundTxId: refundResult.transactionId },
            createdAt: now
          });

          await this.notificationService.notifyBookingEvent('refunded', booking, { refundAmount: existingPayment.amount });
        }
      }
    } else if (targetStatus === 'completed') {
      const existingPayment = await this.db.getPaymentByBookingId(booking.id);
      const reports = await this.db.getReports();
      const hasOpenDispute = reports.some(
        (r) => r.bookingId === booking.id && (r.status === 'open' || r.status === 'investigating')
      );

      const eligibility = this.payoutProvider.checkEligibility(
        { ...booking, status: 'completed' },
        existingPayment,
        hasOpenDispute
      );

      if (eligibility.eligible) {
        const netAmount = eligibility.netPayoutAmount || Math.round(booking.totalPrice * 0.85);
        const payoutResult = await this.payoutProvider.createPayout({
          companionId: booking.companionId,
          bookingId: booking.id,
          amount: netAmount,
          currency: booking.currency
        });

        await this.db.createPayout({
          id: `pout-${Date.now()}`,
          companionId: booking.companionId,
          bookingId: booking.id,
          amount: netAmount,
          currency: booking.currency,
          status: payoutResult.status,
          providerTxId: payoutResult.payoutId,
          createdAt: now
        });

        await this.db.createAuditLog({
          id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          actorId,
          actorRole,
          action: 'PAYMENT_PAYOUT_RELEASED',
          targetType: 'PAYOUT',
          targetId: payoutResult.payoutId,
          payload: {
            bookingId: booking.id,
            companionId: booking.companionId,
            netAmount,
            platformFee: eligibility.platformFee
          },
          createdAt: now
        });

        await this.notificationService.notifyBookingEvent('payout', booking, { payoutAmount: netAmount });
      } else {
        await this.db.createAuditLog({
          id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          actorId,
          actorRole,
          action: 'PAYMENT_PAYOUT_HELD',
          targetType: 'BOOKING',
          targetId: booking.id,
          payload: { reason: eligibility.reason },
          createdAt: now
        });
      }
    } else if (targetStatus === 'reviewed' && input.rating) {
      await this.db.createReview({
        id: `rev-${Date.now()}`,
        bookingId: booking.id,
        customerId: booking.customerId,
        companionId: booking.companionId,
        rating: input.rating,
        reviewText: input.review || 'Completed public Hyderabad experience.',
        createdAt: now
      });

      // Update companion rating
      const companion = await this.db.getCompanionById(booking.companionId);
      if (companion) {
        const newReviews = companion.reviews + 1;
        const newRating = Number(((companion.rating * companion.reviews + input.rating) / newReviews).toFixed(2));
        await this.db.upsertCompanion({
          ...companion,
          reviews: newReviews,
          rating: newRating,
          updatedAt: now
        });
      }
    }

    const updatedBooking = await this.db.updateBooking(bookingId, updates);
    if (!updatedBooking) {
      throw new Error(`Failed to update booking "${bookingId}".`);
    }

    // Log lifecycle event
    await this.db.createBookingEvent({
      id: `evt-${bookingId}-${Date.now()}`,
      bookingId,
      fromStatus: booking.status,
      toStatus: targetStatus,
      actorRole,
      actorId,
      notes: input.notes || `Transitioned to ${targetStatus}`,
      timestamp: now
    });

    // Log audit
    await this.db.createAuditLog({
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      actorId,
      actorRole,
      action: `BOOKING_TRANSITION_${targetStatus.toUpperCase()}`,
      targetType: 'BOOKING',
      targetId: bookingId,
      payload: { from: booking.status, to: targetStatus, ...updates },
      createdAt: now
    });

    // Send multi-channel lifecycle notifications (in-app, SMS, email)
    await this.notificationService.notifyBookingEvent(targetStatus as any, updatedBooking);

    // Backward-compatible mock notification send
    await this.notificationProvider.send({
      userId: booking.customerId,
      channel: 'in_app',
      title: 'Booking Status Updated',
      message: `Your booking status is now: ${targetStatus}.`
    });

    return updatedBooking;
  }

  private assertRolePermission(from: BookingStatus, to: BookingStatus, actorRole: BookingActorRole): void {
    if (actorRole === 'admin') {
      return; // Admin has operational authority
    }

    if (actorRole === 'customer') {
      if (from === 'accepted' && to === 'confirmed') return;
      if (['requested', 'accepted', 'confirmed'].includes(from) && to === 'cancelled') return;
      if (from === 'completed' && to === 'reviewed') return;
      if (['confirmed', 'in_progress', 'completed', 'no_show'].includes(from) && to === 'disputed') return;

      throw new Error(`Customer is not authorized to transition booking from "${from}" to "${to}".`);
    }

    if (actorRole === 'companion') {
      if (from === 'requested' && (to === 'accepted' || to === 'declined')) return;
      if (['accepted', 'confirmed'].includes(from) && to === 'cancelled') return;
      if (from === 'confirmed' && (to === 'in_progress' || to === 'no_show')) return;
      if (from === 'in_progress' && (to === 'completed' || to === 'disputed')) return;
      if (from === 'confirmed' && to === 'disputed') return;

      throw new Error(`Companion is not authorized to transition booking from "${from}" to "${to}".`);
    }

    if (actorRole === 'system') {
      return;
    }

    throw new Error(`Role "${actorRole}" is not authorized to change booking status.`);
  }
}
