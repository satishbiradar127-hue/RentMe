import { IncomingMessage, ServerResponse } from 'http';
import {
  sendJson,
  sendError,
  handleGetSession,
  handlePostSession,
  handlePostRefresh,
  handlePostLogin,
  handlePostSignup,
  handlePostLogout,
  handleGetCompanions,
  handleGetCompanionById,
  handleGetCompanionAvailability,
  handleGetExperiences,
  handleGetBookings,
  handleGetBookingById,
  handleCreateBooking,
  handleTransitionBooking,
  handleGetReviews,
  handleCreateReview,
  handleGetReports,
  handleCreateReport,
  handleResolveReport,
  handleGetAdminMetrics,
  handleGetAdminOverview,
  handleAdminReset,
  handleGetKycStatus,
  handlePostKycSubmit,
  handleGetAdminVerifications,
  handleReviewVerification,
  handleCreatePaymentIntent,
  handlePaymentWebhook,
  handleGetPayoutEligibility,
  handleGetNotifications,
  handleMarkNotificationRead,
  handleGetReadiness
} from './handlers';


export async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const urlString = req.url || '/';
  if (!urlString.startsWith('/api/') && urlString !== '/api') {
    return false;
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Actor-Role, X-Actor-Id'
    });
    res.end();
    return true;
  }

  try {
    const url = new URL(urlString, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = (req.method || 'GET').toUpperCase();

    // 1. Auth / Session
    if (pathname === '/api/auth/session') {
      if (method === 'GET') {
        await handleGetSession(req, res);
        return true;
      }
      if (method === 'POST') {
        await handlePostSession(req, res);
        return true;
      }
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      await handlePostLogin(req, res);
      return true;
    }

    if (pathname === '/api/auth/refresh' && method === 'POST') {
      await handlePostRefresh(req, res);
      return true;
    }

    if (pathname === '/api/auth/signup' && method === 'POST') {
      await handlePostSignup(req, res);
      return true;
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      await handlePostLogout(req, res);
      return true;
    }

    // 2. Companions
    if (pathname === '/api/companions') {
      if (method === 'GET') {
        await handleGetCompanions(req, res, url.searchParams);
        return true;
      }
    }

    const companionAvailMatch = pathname.match(/^\/api\/companions\/([^/]+)\/availability$/);
    if (companionAvailMatch && method === 'GET') {
      await handleGetCompanionAvailability(res, companionAvailMatch[1]);
      return true;
    }

    const companionMatch = pathname.match(/^\/api\/companions\/([^/]+)$/);
    if (companionMatch && method === 'GET') {
      await handleGetCompanionById(res, companionMatch[1]);
      return true;
    }

    // 3. Experiences
    if (pathname === '/api/experiences' && method === 'GET') {
      await handleGetExperiences(res);
      return true;
    }

    // 4. Bookings
    if (pathname === '/api/bookings') {
      if (method === 'GET') {
        await handleGetBookings(req, res, url.searchParams);
        return true;
      }
      if (method === 'POST') {
        await handleCreateBooking(req, res);
        return true;
      }
    }

    const bookingTransitionMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/transition$/);
    if (bookingTransitionMatch && method === 'POST') {
      await handleTransitionBooking(req, res, bookingTransitionMatch[1]);
      return true;
    }

    const bookingPaymentIntentMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/payment-intent$/);
    if (bookingPaymentIntentMatch && method === 'POST') {
      await handleCreatePaymentIntent(req, res, bookingPaymentIntentMatch[1]);
      return true;
    }

    const bookingPayoutEligibleMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/payout-eligibility$/);
    if (bookingPayoutEligibleMatch && method === 'GET') {
      await handleGetPayoutEligibility(req, res, bookingPayoutEligibleMatch[1]);
      return true;
    }

    const bookingMatch = pathname.match(/^\/api\/bookings\/([^/]+)$/);
    if (bookingMatch && method === 'GET') {
      await handleGetBookingById(req, res, bookingMatch[1]);
      return true;
    }

    // 4b. Payment Webhook
    if (pathname === '/api/payments/webhook' && method === 'POST') {
      await handlePaymentWebhook(req, res);
      return true;
    }

    // 5. Reviews
    if (pathname === '/api/reviews') {
      if (method === 'GET') {
        await handleGetReviews(res, url.searchParams);
        return true;
      }
      if (method === 'POST') {
        await handleCreateReview(req, res);
        return true;
      }
    }

    // 6. Reports
    if (pathname === '/api/reports') {
      if (method === 'GET') {
        await handleGetReports(req, res);
        return true;
      }
      if (method === 'POST') {
        await handleCreateReport(req, res);
        return true;
      }
    }

    const reportResolveMatch = pathname.match(/^\/api\/reports\/([^/]+)\/resolve$/);
    if (reportResolveMatch && method === 'POST') {
      await handleResolveReport(req, res, reportResolveMatch[1]);
      return true;
    }

    // 7. Admin
    if (pathname === '/api/admin/metrics' && method === 'GET') {
      await handleGetAdminMetrics(req, res);
      return true;
    }

    if (pathname === '/api/admin/overview' && method === 'GET') {
      await handleGetAdminOverview(req, res);
      return true;
    }

    if (pathname === '/api/admin/reset' && method === 'POST') {
      await handleAdminReset(req, res);
      return true;
    }

    // 7. Companion Verification / KYC Routes
    if (pathname === '/api/kyc/status' && method === 'GET') {
      await handleGetKycStatus(req, res);
      return true;
    }

    if (pathname === '/api/kyc/submit' && method === 'POST') {
      await handlePostKycSubmit(req, res);
      return true;
    }

    if (pathname === '/api/admin/verifications' && method === 'GET') {
      await handleGetAdminVerifications(req, res);
      return true;
    }

    const kycReviewMatch = pathname.match(/^\/api\/admin\/verifications\/([^/]+)\/review$/);
    if (kycReviewMatch && method === 'POST') {
      await handleReviewVerification(req, res, kycReviewMatch[1]);
      return true;
    }

    // 8. Notifications
    if (pathname === '/api/notifications' && method === 'GET') {
      await handleGetNotifications(req, res, url.searchParams);
      return true;
    }

    const notifReadMatch = pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
    if (notifReadMatch && (method === 'POST' || method === 'PATCH')) {
      await handleMarkNotificationRead(req, res, notifReadMatch[1]);
      return true;
    }

    // 9. Health & Readiness
    if (pathname === '/api/ready' && method === 'GET') {
      await handleGetReadiness(res);
      return true;
    }

    if (pathname === '/api/health' && method === 'GET') {
      sendJson(res, 200, {
        status: 'healthy',
        uptime: process.uptime(),
        version: '0.1.0',
        timestamp: new Date().toISOString()
      });
      return true;
    }

    sendError(res, 404, `Endpoint ${method} ${pathname} not found`);
    return true;
  } catch (err: any) {
    sendError(res, 500, err.message || 'Internal Server Error');
    return true;
  }
}

