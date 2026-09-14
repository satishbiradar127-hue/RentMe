const assert = require("node:assert");
const http = require("node:http");

process.env.PORT = "5233";
const { server } = require("../server.js");

function makeRequest(path, method = "GET", body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const port = Number(process.env.TARGET_PORT || (address && typeof address === "object" ? address.port : 5233));

    const reqHeaders = { ...headers };
    let payload = null;
    if (body) {
      payload = typeof body === "string" ? body : JSON.stringify(body);
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: "localhost",
        port,
        path,
        method,
        headers: reqHeaders
      },
      (res) => {
        let resData = "";
        res.on("data", (chunk) => {
          resData += chunk;
        });
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(resData);
          } catch {
            parsed = resData;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );

    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runAuthTests() {
  console.log("Starting RentMe Real Supabase Authentication & Authorization Test Suite...\n");

  // 1. Signup Flow: Customer and Companion
  console.log("--- 1. Testing Signup Flow ---");
  const testCustomerEmail = `test.customer.${Date.now()}@example.com`;
  const customerSignupRes = await makeRequest("/api/auth/signup", "POST", {
    email: testCustomerEmail,
    password: "Password123!",
    name: "Kavita Test",
    role: "customer",
    phone: "+91 99999 11111"
  });
  assert.strictEqual(customerSignupRes.status, 201, "Customer signup should return 201");
  assert.strictEqual(customerSignupRes.body.success, true);
  assert.ok(customerSignupRes.body.session.token, "Signup must return Supabase access token");
  assert.strictEqual(customerSignupRes.body.session.role, "customer", "Role must be customer");
  assert.strictEqual(customerSignupRes.body.session.user.email, testCustomerEmail);
  console.log("✔ Customer signup with real Supabase token successful");

  const testCompanionEmail = `test.companion.${Date.now()}@example.com`;
  const companionSignupRes = await makeRequest("/api/auth/signup", "POST", {
    email: testCompanionEmail,
    password: "Password123!",
    name: "Priya Host",
    role: "companion",
    phone: "+91 99999 22222"
  });
  assert.strictEqual(companionSignupRes.status, 201, "Companion signup should return 201");
  assert.strictEqual(companionSignupRes.body.session.role, "companion", "Role must be companion");
  console.log("✔ Companion signup with real Supabase token successful");

  // 2. Login Flow: Pre-seeded and New Accounts
  console.log("\n--- 2. Testing Login Flow ---");
  // Test invalid credentials
  const invalidLoginRes = await makeRequest("/api/auth/login", "POST", {
    email: "rohan@example.com",
    password: "WrongPassword!"
  });
  assert.strictEqual(invalidLoginRes.status, 401, "Invalid password should return 401");
  console.log("✔ Invalid login rejected with 401");

  // Log in as Rohan (Customer)
  const rohanLoginRes = await makeRequest("/api/auth/login", "POST", {
    email: "rohan@example.com",
    password: "RentMe2026!"
  });
  assert.strictEqual(rohanLoginRes.status, 200, "Rohan login should succeed");
  assert.ok(rohanLoginRes.body.session.token, "Rohan login must return token");
  assert.strictEqual(rohanLoginRes.body.session.role, "customer");
  assert.strictEqual(rohanLoginRes.body.session.user.id, "user-rohan");
  const rohanToken = rohanLoginRes.body.session.token;
  const rohanRefreshToken = rohanLoginRes.body.session.refreshToken;
  console.log("✔ Customer login (Rohan) returns verified token & DB-authoritative role");

  // Log in as Aisha (Companion)
  const aishaLoginRes = await makeRequest("/api/auth/login", "POST", {
    email: "aisha@rentme.local",
    password: "RentMe2026!"
  });
  assert.strictEqual(aishaLoginRes.status, 200, "Aisha login should succeed");
  assert.ok(aishaLoginRes.body.session.token, "Aisha login must return token");
  assert.strictEqual(aishaLoginRes.body.session.role, "companion");
  assert.strictEqual(aishaLoginRes.body.session.user.id, "user-aisha");
  const aishaToken = aishaLoginRes.body.session.token;
  console.log("✔ Companion login (Aisha) returns verified token & DB-authoritative role");

  // Log in as Admin
  const adminLoginRes = await makeRequest("/api/auth/login", "POST", {
    email: "admin@rentme.local",
    password: "RentMe2026!"
  });
  assert.strictEqual(adminLoginRes.status, 200, "Admin login should succeed");
  assert.ok(adminLoginRes.body.session.token, "Admin login must return token");
  assert.strictEqual(adminLoginRes.body.session.role, "admin");
  assert.strictEqual(adminLoginRes.body.session.user.id, "user-admin");
  const adminToken = adminLoginRes.body.session.token;
  console.log("✔ Admin login returns verified token & DB-authoritative role");

  // 3. Session Restore
  console.log("\n--- 3. Testing Session Restore Flow ---");
  const rohanSessionRes = await makeRequest("/api/auth/session", "GET", null, {
    Authorization: `Bearer ${rohanToken}`
  });
  assert.strictEqual(rohanSessionRes.status, 200);
  assert.strictEqual(rohanSessionRes.body.session.user.id, "user-rohan");
  assert.strictEqual(rohanSessionRes.body.session.role, "customer");

  const aishaSessionRes = await makeRequest("/api/auth/session", "GET", null, {
    Authorization: `Bearer ${aishaToken}`
  });
  assert.strictEqual(aishaSessionRes.status, 200);
  assert.strictEqual(aishaSessionRes.body.session.user.id, "user-aisha");
  assert.strictEqual(aishaSessionRes.body.session.role, "companion");

  const badTokenSessionRes = await makeRequest("/api/auth/session", "GET", null, {
    Authorization: "Bearer invalid.fake.token"
  });
  assert.strictEqual(badTokenSessionRes.status, 401, "Invalid token must return 401 on session restore");
  console.log("✔ Session restore with Bearer token validated against Supabase; invalid tokens rejected");

  // 3b. Session Refresh
  console.log("\n--- 3b. Testing Session Refresh Flow ---");
  const badRefreshRes = await makeRequest("/api/auth/refresh", "POST", {
    refreshToken: "invalid_refresh_token_xyz"
  });
  assert.strictEqual(badRefreshRes.status, 401, "Invalid refresh token must return 401");

  if (rohanRefreshToken) {
    const refreshRes = await makeRequest("/api/auth/refresh", "POST", {
      refreshToken: rohanRefreshToken
    });
    assert.strictEqual(refreshRes.status, 200, "Valid refresh token should return 200");
    assert.ok(refreshRes.body.session.token, "Refreshed session must include new token");
    assert.strictEqual(refreshRes.body.session.user.id, "user-rohan");
    console.log("✔ Session refresh with Supabase refresh token successful");
  } else {
    console.log("ℹ Refresh token tested for rejection on invalid credentials");
  }

  // 4. Logout
  console.log("\n--- 4. Testing Logout Flow ---");
  const logoutRes = await makeRequest("/api/auth/logout", "POST");
  assert.strictEqual(logoutRes.status, 200);
  console.log("✔ Logout endpoint functional");

  // 5. Booking API Authentication & Authorization
  console.log("\n--- 5. Testing Booking Protection & Role Authority ---");
  // Reject unauthenticated booking creation
  const unauthBookingRes = await makeRequest(
    "/api/bookings",
    "POST",
    {
      companionId: "aisha",
      experienceId: "aisha-charminar-walk",
      date: "2026-09-12",
      partySize: 1
    },
    { Authorization: "Bearer invalid_token" }
  );
  assert.strictEqual(unauthBookingRes.status, 401, "Booking creation with invalid token must return 401");
  console.log("✔ Booking creation requires valid authenticated token (401 on invalid)");

  // Customer creates authenticated booking
  const createBookingRes = await makeRequest(
    "/api/bookings",
    "POST",
    {
      companionId: "aisha",
      experienceId: "aisha-charminar-walk",
      date: "2026-09-12",
      partySize: 2,
      notes: "Authenticated heritage walk"
    },
    { Authorization: `Bearer ${rohanToken}` }
  );
  assert.strictEqual(createBookingRes.status, 201, "Authenticated customer can create booking");
  const bookingId = createBookingRes.body.booking.id;
  assert.strictEqual(createBookingRes.body.booking.status, "requested");
  assert.strictEqual(createBookingRes.body.booking.customerId, "user-rohan");
  console.log("✔ Authenticated booking created by customer (role authoritatively resolved)");

  // Customer attempts to accept booking (even if passing spoofed X-Actor-Role or actorRole: 'companion')
  const spoofedAcceptRes = await makeRequest(
    `/api/bookings/${bookingId}/transition`,
    "POST",
    {
      action: "accepted",
      actorRole: "companion" // Spoofed in body!
    },
    {
      Authorization: `Bearer ${rohanToken}`, // Rohan's JWT is customer!
      "X-Actor-Role": "companion" // Spoofed in header!
    }
  );
  assert.strictEqual(spoofedAcceptRes.status, 400, "Customer JWT must NOT be allowed to accept booking");
  assert.ok(spoofedAcceptRes.body.error.includes("not authorized"), "Error must state not authorized");
  console.log("✔ Backend NEVER trusts client-supplied role: customer cannot accept booking despite spoofed headers");

  // Real companion (Aisha) accepts booking
  const companionAcceptRes = await makeRequest(
    `/api/bookings/${bookingId}/transition`,
    "POST",
    { action: "accepted" },
    { Authorization: `Bearer ${aishaToken}` }
  );
  assert.strictEqual(companionAcceptRes.status, 200, "Companion Aisha can accept booking");
  assert.strictEqual(companionAcceptRes.body.booking.status, "accepted");
  console.log("✔ Real companion accepts booking");

  // Customer confirms booking
  const customerConfirmRes = await makeRequest(
    `/api/bookings/${bookingId}/transition`,
    "POST",
    { action: "confirmed" },
    { Authorization: `Bearer ${rohanToken}` }
  );
  assert.strictEqual(customerConfirmRes.status, 200, "Customer Rohan confirms booking");
  assert.strictEqual(customerConfirmRes.body.booking.status, "confirmed");
  console.log("✔ Customer confirms booking");

  // Companion starts and completes trip
  const companionStartRes = await makeRequest(
    `/api/bookings/${bookingId}/transition`,
    "POST",
    { action: "in_progress" },
    { Authorization: `Bearer ${aishaToken}` }
  );
  assert.strictEqual(companionStartRes.status, 200);

  const companionCompleteRes = await makeRequest(
    `/api/bookings/${bookingId}/transition`,
    "POST",
    { action: "completed" },
    { Authorization: `Bearer ${aishaToken}` }
  );
  assert.strictEqual(companionCompleteRes.status, 200);
  console.log("✔ Companion starts and completes booking");

  // Customer reviews trip
  const reviewRes = await makeRequest(
    "/api/reviews",
    "POST",
    {
      bookingId,
      companionId: "aisha",
      rating: 5,
      reviewText: "Authenticated 5-star tour!"
    },
    { Authorization: `Bearer ${rohanToken}` }
  );
  assert.strictEqual(reviewRes.status, 201, "Customer can review completed trip");
  console.log("✔ Customer reviews trip successfully");

  // Companion cannot review themselves
  const companionReviewRes = await makeRequest(
    "/api/reviews",
    "POST",
    {
      bookingId,
      companionId: "aisha",
      rating: 5,
      reviewText: "Reviewing myself"
    },
    { Authorization: `Bearer ${aishaToken}` }
  );
  assert.strictEqual(companionReviewRes.status, 403, "Companion reviewing themselves should be blocked with 403");
  console.log("✔ Companion blocked from submitting self-reviews (403)");

  // 6. Admin Route Protection
  console.log("\n--- 6. Testing Admin Route Protection ---");
  // Customer attempts to access admin metrics
  const customerAdminMetrics = await makeRequest("/api/admin/metrics", "GET", null, {
    Authorization: `Bearer ${rohanToken}`
  });
  assert.strictEqual(customerAdminMetrics.status, 403, "Customer must be rejected from admin metrics with 403");

  // Companion attempts to access admin overview
  const companionAdminOverview = await makeRequest("/api/admin/overview", "GET", null, {
    Authorization: `Bearer ${aishaToken}`
  });
  assert.strictEqual(companionAdminOverview.status, 403, "Companion must be rejected from admin overview with 403");

  // Unauthenticated/invalid token
  const unauthAdminMetrics = await makeRequest("/api/admin/metrics", "GET", null, {
    Authorization: "Bearer invalid_token"
  });
  assert.strictEqual(unauthAdminMetrics.status, 401, "Invalid token must return 401 on admin routes");

  // Admin accesses admin metrics and overview
  const adminMetricsRes = await makeRequest("/api/admin/metrics", "GET", null, {
    Authorization: `Bearer ${adminToken}`
  });
  assert.strictEqual(adminMetricsRes.status, 200, "Admin can access admin metrics");
  assert.ok(adminMetricsRes.body.metrics.totalBookings >= 1);

  const adminOverviewRes = await makeRequest("/api/admin/overview", "GET", null, {
    Authorization: `Bearer ${adminToken}`
  });
  assert.strictEqual(adminOverviewRes.status, 200, "Admin can access admin overview");
  console.log("✔ Admin routes strictly guarded: customer (403), companion (403), invalid token (401), admin (200)");

  // 7. Route-Level Authorization & Scoping
  console.log("\n--- 7. Testing Route Authorization & Scoping ---");
  // Unauthenticated GET /api/bookings with invalid token -> 401
  const unauthGetBookings = await makeRequest("/api/bookings", "GET", null, {
    Authorization: "Bearer invalid.token.xyz"
  });
  assert.strictEqual(unauthGetBookings.status, 401, "Invalid token must return 401 on /api/bookings");

  // Customer cannot read all safety reports -> 403
  const customerReportsRes = await makeRequest("/api/reports", "GET", null, {
    Authorization: `Bearer ${rohanToken}`
  });
  assert.strictEqual(customerReportsRes.status, 403, "Customer must be rejected with 403 from viewing safety reports");

  // Admin can read safety reports -> 200
  const adminReportsRes = await makeRequest("/api/reports", "GET", null, {
    Authorization: `Bearer ${adminToken}`
  });
  assert.strictEqual(adminReportsRes.status, 200, "Admin can access safety reports");

  // Customer GET /api/bookings returns only their bookings
  const customerBookingsRes = await makeRequest("/api/bookings", "GET", null, {
    Authorization: `Bearer ${rohanToken}`
  });
  assert.strictEqual(customerBookingsRes.status, 200);
  for (const b of customerBookingsRes.body.bookings) {
    assert.strictEqual(b.customerId, "user-rohan", "Bookings must be scoped strictly to customer");
  }
  console.log("✔ Route authorization verified: /api/bookings 401 on invalid token, /api/reports 403 for non-admin, customer scoping enforced");

  // 8. Companion Verification / KYC Workflow Boundary
  console.log("\n--- 8. Testing Companion KYC Workflow Boundary ---");
  // Invalid document format -> rejected
  const invalidKycRes = await makeRequest(
    "/api/kyc/submit",
    "POST",
    {
      documentType: "aadhaar",
      documentNumber: "not-a-number"
    },
    { Authorization: `Bearer ${aishaToken}` }
  );
  assert.strictEqual(invalidKycRes.status, 201);
  assert.strictEqual(invalidKycRes.body.verification.status, "rejected");
  assert.ok(invalidKycRes.body.verification.rejectionReason);
  console.log("✔ KYC document validation correctly rejects invalid document format");

  // Valid document format -> submitted and verified
  const validKycRes = await makeRequest(
    "/api/kyc/submit",
    "POST",
    {
      documentType: "aadhaar",
      documentNumber: "123456789012"
    },
    { Authorization: `Bearer ${aishaToken}` }
  );
  assert.strictEqual(validKycRes.status, 201);
  assert.strictEqual(validKycRes.body.verification.status, "verified");
  assert.ok(validKycRes.body.verification.documentNumberMasked.endsWith("9012"));
  const verificationId = validKycRes.body.verification.id;
  console.log("✔ Valid KYC document submitted, masked, and verified");

  // KYC status check
  const kycStatusRes = await makeRequest("/api/kyc/status", "GET", null, {
    Authorization: `Bearer ${aishaToken}`
  });
  assert.strictEqual(kycStatusRes.status, 200);
  assert.strictEqual(kycStatusRes.body.status, "verified");

  // Admin lists verifications
  const adminVerificationsRes = await makeRequest("/api/admin/verifications", "GET", null, {
    Authorization: `Bearer ${adminToken}`
  });
  assert.strictEqual(adminVerificationsRes.status, 200);
  assert.ok(Array.isArray(adminVerificationsRes.body.verifications));

  // Admin reviews verification
  const reviewKycRes = await makeRequest(
    `/api/admin/verifications/${verificationId}/review`,
    "POST",
    {
      status: "verified",
      notes: "Verified by RentMe Ops admin via Aadhaar mock"
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  assert.strictEqual(reviewKycRes.status, 200);
  assert.strictEqual(reviewKycRes.body.verification.status, "verified");
  console.log("✔ Admin KYC review workflow boundary verified");

  // 9. Verification Status & Booking Eligibility
  console.log("\n--- 9. Testing Booking Eligibility for Verified vs Unverified Companions ---");
  const { getDatabase } = require("../dist/db/database.js");
  const dbStore = getDatabase();
  const unverifiedCompId = `comp-unverified-${Date.now()}`;
  const nowStr = new Date().toISOString();

  // Create an unverified companion
  await dbStore.upsertCompanion({
    id: unverifiedCompId,
    name: "Unverified Host",
    city: "Hyderabad, Telangana",
    category: "Culture & Heritage",
    rate: 1500,
    rating: 5.0,
    reviews: 0,
    response: "30 min",
    status: "unverified",
    verificationStatus: "unverified",
    image: "assets/companion-aisha.svg",
    specialties: ["Heritage"],
    bio: "Pending KYC verification.",
    createdAt: nowStr,
    updatedAt: nowStr
  });

  // Attempt to book unverified companion -> MUST be rejected
  const unverifiedBookingRes = await makeRequest(
    "/api/bookings",
    "POST",
    {
      companionId: unverifiedCompId,
      experienceId: "aisha-charminar-walk",
      date: "2026-09-12",
      partySize: 1
    },
    { Authorization: `Bearer ${rohanToken}` }
  );
  assert.strictEqual(unverifiedBookingRes.status, 400);
  assert.ok(unverifiedBookingRes.body.error.includes("not verified"), "Must reject booking unverified companion");
  console.log("✔ Booking rejected for unverified companion (booking eligibility enforced)");

  // 10. Production Mode Isolation
  console.log("\n--- 10. Testing Production Mode Isolation ---");
  process.env.NODE_ENV = "production";
  delete process.env.ALLOW_DEV_FALLBACK;

  const prodSwitchRes = await makeRequest(
    "/api/auth/session",
    "POST",
    {
      role: "companion",
      userId: "user-aisha"
    },
    { "x-simulate-env": "production" }
  );
  assert.strictEqual(prodSwitchRes.status, 403, "Persona switching must be rejected with 403 in production");
  assert.ok(prodSwitchRes.body.error.includes("disabled in production"));

  // Also verify that AuthService in-process throws when isProductionMode() is true
  const { AuthService } = require("../dist/services/authService.js");
  const inProcessAuthService = new AuthService();
  assert.strictEqual(inProcessAuthService.isProductionMode(), true);
  await assert.rejects(
    async () => {
      await inProcessAuthService.switchSession("companion", "user-aisha");
    },
    /disabled in production/
  );

  // Restore dev environment
  process.env.NODE_ENV = "development";
  console.log("✔ Development persona switching strictly isolated and blocked in production mode (403)");

  // Cleanup test companion
  try {
    const { PostgresStore } = require("../dist/db/database.js");
    if (dbStore instanceof PostgresStore) {
      await dbStore.query("DELETE FROM companions WHERE id = $1", [unverifiedCompId]);
    }
  } catch {}

  // 7. Cleanup test accounts from DB
  try {
    const { getDatabase, PostgresStore } = require("../dist/db/database.js");
    const db = getDatabase();
    if (db instanceof PostgresStore) {
      await db.query("DELETE FROM users WHERE email IN ($1, $2)", [testCustomerEmail, testCompanionEmail]);
      await db.query("DELETE FROM auth.users WHERE email IN ($1, $2)", [testCustomerEmail, testCompanionEmail]);
    }
  } catch {}

  console.log("\nAll RentMe Real Supabase Authentication & Authorization tests passed successfully!");
}

runAuthTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Auth test failure:", err);
    process.exit(1);
  });
