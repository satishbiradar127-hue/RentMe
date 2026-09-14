import { IncomingMessage, ServerResponse } from 'http';
import {
  AuthService,
  CompanionService,
  BookingService,
  ReviewService,
  ReportService,
  AdminService,
  KycService,
  NotificationService
} from '../services';
import { getDatabase } from '../db/database';
import { BookingActorRole, BookingStatus, UserRole, KycDocumentType } from '../models';

const authService = new AuthService();
const companionService = new CompanionService();
const bookingService = new BookingService();
const reviewService = new ReviewService();
const reportService = new ReportService();
const adminService = new AdminService();
const kycService = new KycService();
const notificationService = new NotificationService();


export function sendJson(res: ServerResponse, status: number, data: any): void {
  const payload = JSON.stringify(data);
  const isProd = process.env.NODE_ENV === 'production';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Actor-Role, X-Actor-Id',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
  if (isProd) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }
  res.writeHead(status, headers);
  res.end(payload);
}


export function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message, success: false });
}

export async function parseBody<T = any>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer | string) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(body) as T);
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

export async function parseRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer | string) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function resolveReqRes(
  first: IncomingMessage | ServerResponse,
  second?: ServerResponse
): { req?: IncomingMessage; res: ServerResponse } {
  if (second && 'writeHead' in second) {
    return { req: first as IncomingMessage, res: second };
  }
  return { res: first as ServerResponse };
}

// 1. Auth & Session Handlers

export async function handleGetSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const authHeader = req.headers['authorization'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const auth = await authService.authenticateRequest(req);
    if (!auth.authenticated || !auth.user || !auth.role) {
      sendError(res, 401, auth.error || 'Invalid or expired token');
      return;
    }

    const personas = await authService.listAvailablePersonas();
    sendJson(res, 200, {
      success: true,
      session: {
        user: auth.user,
        role: auth.role,
        token: auth.token,
        isDevFallback: false
      },
      availablePersonas: personas
    });
    return;
  }

  // Dev fallback session for tests / unauthenticated browser probe
  const session = await authService.getCurrentSession();
  const personas = await authService.listAvailablePersonas();
  sendJson(res, 200, {
    success: true,
    session,
    availablePersonas: personas
  });
}

export async function handlePostSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (authService.isProductionMode(req)) {
    sendError(res, 403, 'Persona switching is disabled in production environments');
    return;
  }
  const body = await parseBody<{ role?: UserRole; userId?: string }>(req);
  if (!body.role && !body.userId) {
    sendError(res, 400, 'Specify role or userId to switch session');
    return;
  }
  try {
    const session = await authService.switchSession(body.role || 'customer', body.userId);
    sendJson(res, 200, { success: true, session });
  } catch (err: any) {
    sendError(res, 400, err.message);
  }
}

export async function handlePostRefresh(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await parseBody<{ refreshToken?: string }>(req);
    const refreshToken = body.refreshToken || (req.headers['x-refresh-token'] as string);
    if (!refreshToken) {
      sendError(res, 400, 'Refresh token is required');
      return;
    }
    const session = await authService.refreshToken(refreshToken, req);
    sendJson(res, 200, { success: true, session });
  } catch (err: any) {
    sendError(res, 401, err.message || 'Failed to refresh token');
  }
}

export async function handlePostLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await parseBody<{ email?: string; password?: string }>(req);
    if (!body.email || !body.password) {
      sendError(res, 400, 'Email and password are required');
      return;
    }
    const session = await authService.loginWithPassword(body.email, body.password);
    sendJson(res, 200, { success: true, session });
  } catch (err: any) {
    sendError(res, 401, err.message || 'Invalid login credentials');
  }
}

export async function handlePostSignup(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await parseBody<{
      email?: string;
      password?: string;
      name?: string;
      role?: UserRole;
      phone?: string;
    }>(req);

    if (!body.email || !body.password || !body.name) {
      sendError(res, 400, 'Name, email, and password are required');
      return;
    }

    const session = await authService.signup({
      email: body.email,
      password: body.password,
      name: body.name,
      role: body.role || 'customer',
      phone: body.phone
    });

    sendJson(res, 201, { success: true, session });
  } catch (err: any) {
    sendError(res, 400, err.message || 'Failed to create account');
  }
}

export async function handlePostLogout(req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, { success: true, message: 'Logged out successfully' });
}

// 2. Companion & Experience Handlers

export async function handleGetCompanions(
  req: IncomingMessage,
  res: ServerResponse,
  query: URLSearchParams
): Promise<void> {
  const category = query.get('category') || undefined;
  const search = query.get('query') || query.get('search') || undefined;
  const companions = await companionService.listCompanions({ category, query: search });
  sendJson(res, 200, { success: true, count: companions.length, companions });
}

export async function handleGetCompanionById(res: ServerResponse, id: string): Promise<void> {
  const companion = await companionService.getCompanionById(id);
  if (!companion) {
    sendError(res, 404, `Companion "${id}" not found`);
    return;
  }
  sendJson(res, 200, { success: true, companion });
}

export async function handleGetCompanionAvailability(res: ServerResponse, id: string): Promise<void> {
  const availability = await companionService.getAvailability(id);
  sendJson(res, 200, { success: true, availability: availability.map((a) => a.date) });
}

export async function handleGetExperiences(res: ServerResponse): Promise<void> {
  const experiences = await companionService.listExperiences();
  sendJson(res, 200, { success: true, count: experiences.length, experiences });
}

// 3. Bookings Handlers

export async function handleGetBookings(
  req: IncomingMessage,
  res: ServerResponse,
  query: URLSearchParams
): Promise<void> {
  const auth = await authService.authenticateRequest(req);
  if (!auth.authenticated || !auth.user || !auth.role) {
    sendError(res, 401, auth.error || 'Authentication required to view bookings');
    return;
  }

  let companionId = query.get('companionId') || undefined;
  let customerId = query.get('customerId') || undefined;
  const status = (query.get('status') as BookingStatus) || undefined;

  if (!auth.isDevFallback && auth.user) {
    if (auth.role === 'customer') {
      customerId = auth.user.id;
    } else if (auth.role === 'companion') {
      const comp = await companionService.getCompanionByUserId(auth.user.id);
      if (comp) {
        companionId = comp.id;
      } else {
        sendJson(res, 200, { success: true, count: 0, bookings: [] });
        return;
      }
    }
  }

  const bookings = await bookingService.getBookings({ companionId, customerId, status });
  sendJson(res, 200, { success: true, count: bookings.length, bookings });
}

export async function handleGetBookingById(
  reqOrRes: IncomingMessage | ServerResponse,
  idOrRes: string | ServerResponse,
  maybeId?: string
): Promise<void> {
  const { req, res } = resolveReqRes(reqOrRes, idOrRes as ServerResponse);
  const id = maybeId || (typeof idOrRes === 'string' ? idOrRes : '');

  const booking = await bookingService.getBookingById(id);
  if (!booking) {
    sendError(res, 404, `Booking "${id}" not found`);
    return;
  }

  if (req) {
    const auth = await authService.authenticateRequest(req);
    if (!auth.authenticated || !auth.user || !auth.role) {
      sendError(res, 401, auth.error || 'Authentication required');
      return;
    }

    if (auth.role === 'customer' && !auth.isDevFallback && booking.customerId !== auth.user.id) {
      sendError(res, 403, 'You do not have permission to view this booking');
      return;
    }

    if (auth.role === 'companion' && !auth.isDevFallback) {
      const comp = await companionService.getCompanionByUserId(auth.user.id);
      if (comp && booking.companionId !== comp.id) {
        sendError(res, 403, 'You do not have permission to view this booking');
        return;
      }
    }
  }

  sendJson(res, 200, { success: true, booking });
}

export async function handleCreateBooking(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const auth = await authService.authenticateRequest(req);
    if (!auth.authenticated || !auth.user || !auth.role) {
      sendError(res, 401, auth.error || 'Authentication required to create a booking');
      return;
    }

    if (auth.role !== 'customer' && auth.role !== 'admin' && !auth.isDevFallback) {
      sendError(res, 403, 'Only customers can create booking requests');
      return;
    }

    const body = await parseBody(req);

    // When real auth is present, role and id are authoritative from DB:
    const actorRole: BookingActorRole = auth.isDevFallback && req.headers['x-actor-role']
      ? (req.headers['x-actor-role'] as BookingActorRole)
      : (auth.role as BookingActorRole);

    const actorId: string = auth.isDevFallback && req.headers['x-actor-id']
      ? (req.headers['x-actor-id'] as string)
      : auth.user.id;

    const bookingPayload = {
      ...body,
      customerName: body.customerName || auth.user.name,
      customerEmail: body.customerEmail || auth.user.email
    };

    const booking = await bookingService.createBooking(bookingPayload, actorRole, actorId);
    sendJson(res, 201, { success: true, booking });
  } catch (err: any) {
    sendError(res, 400, err.message);
  }
}

export async function handleTransitionBooking(
  req: IncomingMessage,
  res: ServerResponse,
  bookingId: string
): Promise<void> {
  try {
    const auth = await authService.authenticateRequest(req);
    if (!auth.authenticated || !auth.user || !auth.role) {
      sendError(res, 401, auth.error || 'Authentication required');
      return;
    }

    const body = await parseBody(req);
    const targetStatus = (body.targetStatus || body.action || body.status) as BookingStatus;

    if (!targetStatus) {
      sendError(res, 400, 'Missing targetStatus or action');
      return;
    }

    // Role is strictly from database record when authenticated with JWT:
    const actorRole: BookingActorRole = auth.isDevFallback
      ? ((body.actorRole || req.headers['x-actor-role'] || body.actor || auth.role) as BookingActorRole)
      : (auth.role as BookingActorRole);

    const actorId: string = auth.isDevFallback
      ? ((body.actorId || req.headers['x-actor-id'] || auth.user.id) as string)
      : auth.user.id;

    // Strict role authorization
    if (targetStatus === 'accepted' && actorRole !== 'companion' && actorRole !== 'admin') {
      sendError(res, 400, `Actor role "${actorRole}" is not authorized to transition booking to accepted`);
      return;
    }

    if (targetStatus === 'confirmed' && actorRole !== 'customer' && actorRole !== 'admin') {
      sendError(res, 400, `Actor role "${actorRole}" is not authorized to confirm booking`);
      return;
    }

    if (
      (targetStatus === 'in_progress' || targetStatus === 'completed') &&
      actorRole !== 'companion' &&
      actorRole !== 'admin'
    ) {
      sendError(res, 400, `Actor role "${actorRole}" is not authorized to transition booking to ${targetStatus}`);
      return;
    }

    const booking = await bookingService.transitionBooking(bookingId, {
      targetStatus,
      actorRole,
      actorId,
      cancelledBy: body.cancelledBy || (targetStatus === 'cancelled' ? actorRole : undefined),
      rating: body.rating,
      review: body.review,
      notes: body.notes,
      paymentId: body.paymentId,
      orderId: body.orderId,
      signature: body.signature
    });

    sendJson(res, 200, { success: true, booking });
  } catch (err: any) {
    sendError(res, 400, err.message);
  }
}

// Payment & Payout Handlers

export async function handleCreatePaymentIntent(
  req: IncomingMessage,
  res: ServerResponse,
  bookingId: string
): Promise<void> {
  try {
    const auth = await authService.authenticateRequest(req);
    if (!auth.authenticated || !auth.user || !auth.role) {
      sendError(res, 401, auth.error || 'Authentication required to create payment intent');
      return;
    }

    const actorRole: BookingActorRole = auth.isDevFallback && req.headers['x-actor-role']
      ? (req.headers['x-actor-role'] as BookingActorRole)
      : (auth.role as BookingActorRole);

    const actorId: string = auth.isDevFallback && req.headers['x-actor-id']
      ? (req.headers['x-actor-id'] as string)
      : auth.user.id;

    const result = await bookingService.createPaymentIntent(bookingId, actorRole, actorId);
    sendJson(res, 201, { success: true, ...result });
  } catch (err: any) {
    sendError(res, 400, err.message);
  }
}

export async function handlePaymentWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const rawBody = await parseRawBody(req);
    const signature =
      (req.headers['x-razorpay-signature'] as string) ||
      (req.headers['x-webhook-signature'] as string) ||
      '';

    if (!signature) {
      sendError(res, 400, 'Missing webhook signature header');
      return;
    }

    const result = await bookingService.handlePaymentWebhook(rawBody, signature);
    sendJson(res, 200, result);
  } catch (err: any) {
    sendError(res, 400, err.message);
  }
}

export async function handleGetPayoutEligibility(
  req: IncomingMessage,
  res: ServerResponse,
  bookingId: string
): Promise<void> {
  try {
    const auth = await authService.authenticateRequest(req);
    if (!auth.authenticated || !auth.user || !auth.role) {
      sendError(res, 401, auth.error || 'Authentication required');
      return;
    }

    const eligibility = await bookingService.getPayoutEligibility(bookingId);
    sendJson(res, 200, { success: true, ...eligibility });
  } catch (err: any) {
    sendError(res, 400, err.message);
  }
}

// 4. Reviews Handlers

export async function handleGetReviews(res: ServerResponse, query: URLSearchParams): Promise<void> {
  const companionId = query.get('companionId') || undefined;
  const reviews = await reviewService.listReviews(companionId);
  sendJson(res, 200, { success: true, count: reviews.length, reviews });
}

export async function handleCreateReview(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const auth = await authService.authenticateRequest(req);
    if (!auth.authenticated || !auth.user || !auth.role) {
      sendError(res, 401, auth.error || 'Authentication required to submit review');
      return;
    }

    if (auth.role === 'companion' && !auth.isDevFallback) {
      sendError(res, 403, 'Companions cannot submit reviews for themselves');
      return;
    }

    const body = await parseBody(req);
    const customerId = auth.isDevFallback && body.customerId ? body.customerId : auth.user.id;

    const review = await reviewService.createReview({
      bookingId: body.bookingId,
      customerId,
      companionId: body.companionId,
      rating: Number(body.rating),
      reviewText: body.reviewText || body.review || ''
    });

    sendJson(res, 201, { success: true, review });
  } catch (err: any) {
    sendError(res, 400, err.message);
  }
}

// 5. Reports Handlers (Trust & Safety)

export async function handleGetReports(
  reqOrRes: IncomingMessage | ServerResponse,
  maybeRes?: ServerResponse
): Promise<void> {
  const { req, res } = resolveReqRes(reqOrRes, maybeRes);

  if (req) {
    const auth = await authService.authenticateRequest(req);
    if (!auth.authenticated || !auth.user || !auth.role) {
      sendError(res, 401, auth.error || 'Authentication required to view reports');
      return;
    }

    if (auth.role !== 'admin' && !auth.isDevFallback) {
      sendError(res, 403, 'Admin access required to view safety reports');
      return;
    }
  }

  const reports = await reportService.listReports();
  sendJson(res, 200, { success: true, count: reports.length, reports });
}

export async function handleCreateReport(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const auth = await authService.authenticateRequest(req);
    if (!auth.authenticated || !auth.user || !auth.role) {
      sendError(res, 401, auth.error || 'Authentication required to file a report');
      return;
    }

    const body = await parseBody(req);
    const reporterUserId = auth.isDevFallback && body.reporterUserId ? body.reporterUserId : auth.user.id;

    const report = await reportService.createReport({
      reporterUserId,
      reportedUserId: body.reportedUserId,
      bookingId: body.bookingId,
      category: body.category || 'support',
      description: body.description || body.notes || 'User concern filed.'
    });

    sendJson(res, 201, { success: true, report });
  } catch (err: any) {
    sendError(res, 400, err.message);
  }
}

export async function handleResolveReport(
  req: IncomingMessage,
  res: ServerResponse,
  reportId: string
): Promise<void> {
  try {
    const auth = await authService.authenticateRequest(req);
    if (!auth.authenticated || !auth.user || !auth.role) {
      sendError(res, 401, auth.error || 'Authentication required');
      return;
    }

    // Strict admin authorization
    if (auth.role !== 'admin' && !auth.isDevFallback) {
      sendError(res, 403, 'Admin access required to resolve safety reports');
      return;
    }

    const body = await parseBody(req);
    const report = await reportService.resolveReport(
      reportId,
      body.resolutionNotes || 'Resolved by admin',
      auth.user.id
    );
    sendJson(res, 200, { success: true, report });
  } catch (err: any) {
    sendError(res, 400, err.message);
  }
}

// 6. Admin Handlers

export async function handleGetAdminMetrics(
  reqOrRes: IncomingMessage | ServerResponse,
  maybeRes?: ServerResponse
): Promise<void> {
  const { req, res } = resolveReqRes(reqOrRes, maybeRes);

  if (req) {
    const auth = await authService.authenticateRequest(req);
    if (!auth.authenticated || !auth.user || !auth.role) {
      sendError(res, 401, auth.error || 'Authentication required');
      return;
    }

    if (auth.role !== 'admin') {
      if (!auth.isDevFallback || (req.headers['x-actor-role'] && req.headers['x-actor-role'] !== 'admin')) {
        sendError(res, 403, 'Admin access required');
        return;
      }
    }
  }

  const metrics = await adminService.getMetrics();
  sendJson(res, 200, { success: true, metrics });
}

export async function handleGetAdminOverview(
  reqOrRes: IncomingMessage | ServerResponse,
  maybeRes?: ServerResponse
): Promise<void> {
  const { req, res } = resolveReqRes(reqOrRes, maybeRes);

  if (req) {
    const auth = await authService.authenticateRequest(req);
    if (!auth.authenticated || !auth.user || !auth.role) {
      sendError(res, 401, auth.error || 'Authentication required');
      return;
    }

    if (auth.role !== 'admin') {
      if (!auth.isDevFallback || (req.headers['x-actor-role'] && req.headers['x-actor-role'] !== 'admin')) {
        sendError(res, 403, 'Admin access required');
        return;
      }
    }
  }

  const overview = await adminService.getOverview();
  sendJson(res, 200, { success: true, overview });
}

export async function handleAdminReset(
  reqOrRes: IncomingMessage | ServerResponse,
  maybeRes?: ServerResponse
): Promise<void> {
  const { req, res } = resolveReqRes(reqOrRes, maybeRes);

  if (req) {
    const auth = await authService.authenticateRequest(req);
    if (!auth.authenticated || !auth.user || !auth.role) {
      sendError(res, 401, auth.error || 'Authentication required');
      return;
    }

    if (auth.role !== 'admin') {
      if (!auth.isDevFallback || (req.headers['x-actor-role'] && req.headers['x-actor-role'] !== 'admin')) {
        sendError(res, 403, 'Admin access required');
        return;
      }
    }
  }

  await adminService.resetSeedData();
  sendJson(res, 200, { success: true, message: 'Seed data restored successfully.' });
}

// 7. Companion Verification / KYC Handlers

export async function handleGetKycStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const auth = await authService.authenticateRequest(req);
    if (!auth.authenticated || !auth.user) {
      sendError(res, 401, auth.error || 'Authentication required');
      return;
    }

    const effectiveUserId =
      auth.isDevFallback && req.headers['x-actor-id']
        ? (req.headers['x-actor-id'] as string)
        : auth.user.id;

    const status = await kycService.getKycStatus(effectiveUserId);
    sendJson(res, 200, { success: true, ...status });
  } catch (err: any) {
    sendError(res, 400, err.message);
  }
}

export async function handlePostKycSubmit(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const auth = await authService.authenticateRequest(req);
    if (!auth.authenticated || !auth.user) {
      sendError(res, 401, auth.error || 'Authentication required');
      return;
    }

    const effectiveUserId =
      auth.isDevFallback && req.headers['x-actor-id']
        ? (req.headers['x-actor-id'] as string)
        : auth.user.id;

    const body = await parseBody<{ documentType?: KycDocumentType; documentNumber?: string }>(req);
    if (!body.documentType || !body.documentNumber) {
      sendError(res, 400, 'Document type and document number are required');
      return;
    }

    const verification = await kycService.submitKyc({
      userId: effectiveUserId,
      documentType: body.documentType,
      documentNumber: body.documentNumber
    });

    sendJson(res, 201, { success: true, verification });
  } catch (err: any) {
    sendError(res, 400, err.message);
  }
}

export async function handleGetAdminVerifications(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const auth = await authService.authenticateRequest(req);
    if (!auth.authenticated || !auth.user || !auth.role) {
      sendError(res, 401, auth.error || 'Authentication required');
      return;
    }

    if (auth.role !== 'admin' && !auth.isDevFallback) {
      sendError(res, 403, 'Admin access required to view KYC verifications');
      return;
    }

    const verifications = await kycService.listVerifications();
    sendJson(res, 200, { success: true, count: verifications.length, verifications });
  } catch (err: any) {
    sendError(res, 400, err.message);
  }
}

export async function handleReviewVerification(
  req: IncomingMessage,
  res: ServerResponse,
  verificationId: string
): Promise<void> {
  try {
    const auth = await authService.authenticateRequest(req);
    if (!auth.authenticated || !auth.user || !auth.role) {
      sendError(res, 401, auth.error || 'Authentication required');
      return;
    }

    if (auth.role !== 'admin' && !auth.isDevFallback) {
      sendError(res, 403, 'Admin access required to review KYC verifications');
      return;
    }

    const body = await parseBody<{ status?: 'verified' | 'rejected'; notes?: string }>(req);
    if (!body.status || (body.status !== 'verified' && body.status !== 'rejected')) {
      sendError(res, 400, 'Decision status must be "verified" or "rejected"');
      return;
    }

    const updated = await kycService.reviewVerification(
      verificationId,
      auth.user.id,
      body.status,
      body.notes
    );

    sendJson(res, 200, { success: true, verification: updated });
  } catch (err: any) {
    sendError(res, 400, err.message);
  }
}

// 8. Notifications Handlers

export async function handleGetNotifications(
  req: IncomingMessage,
  res: ServerResponse,
  searchParams?: URLSearchParams
): Promise<void> {
  try {
    const auth = await authService.authenticateRequest(req);
    let targetUserId =
      auth.isDevFallback && req.headers['x-actor-id']
        ? (req.headers['x-actor-id'] as string)
        : auth.user?.id || (req.headers['x-actor-id'] as string);

    if ((auth.role === 'admin' || auth.isDevFallback) && searchParams?.get('userId')) {
      targetUserId = searchParams.get('userId')!;
    }

    if (!targetUserId) {
      sendError(res, 401, 'Authentication or actor identification required');
      return;
    }

    const notifications = await notificationService.getUserNotifications(targetUserId);
    sendJson(res, 200, { success: true, count: notifications.length, notifications });
  } catch (err: any) {
    sendError(res, 500, err.message);
  }
}

export async function handleMarkNotificationRead(
  req: IncomingMessage,
  res: ServerResponse,
  notificationId: string
): Promise<void> {
  try {
    const updated = await notificationService.markAsRead(notificationId);
    if (!updated) {
      sendError(res, 404, `Notification "${notificationId}" not found`);
      return;
    }
    sendJson(res, 200, { success: true, notification: updated });
  } catch (err: any) {
    sendError(res, 500, err.message);
  }
}

// 9. Readiness Handler (Production Health & Dependent Provider Probe)

export async function handleGetReadiness(res: ServerResponse): Promise<void> {
  try {
    const db = getDatabase();
    // Verify database responsiveness with active read
    await db.getCompanions();

    sendJson(res, 200, {
      status: 'ready',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        type: process.env.DATABASE_URL ? 'postgresql' : 'in-memory',
        status: 'connected'
      },
      providers: {
        payment: process.env.RAZORPAY_KEY_ID ? 'razorpay-live' : 'mock',
        email: process.env.RESEND_API_KEY ? 'resend-live' : 'mock-email',
        sms: process.env.TWILIO_ACCOUNT_SID ? 'twilio-live' : 'mock-sms',
        kyc: 'automated-id-mock'
      }
    });
  } catch (err: any) {
    sendJson(res, 503, {
      status: 'unready',
      error: err.message || 'Readiness probe failed',
      timestamp: new Date().toISOString()
    });
  }
}

