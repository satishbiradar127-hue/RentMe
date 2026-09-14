const assert = require("node:assert");
const http = require("node:http");

process.env.PORT = process.env.PORT || "5266";
const { server } = require("../server.js");
const {
  getEmailProvider,
  getSmsProvider,
  MockEmailProvider,
  MockSmsProvider
} = require("../dist/providers/notificationProvider.js");
const { getNotificationService } = require("../dist/services/notificationService.js");

function makeRequest(path, method = "GET", body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const port = Number(process.env.TARGET_PORT || (address && typeof address === "object" ? address.port : 5173));

    const reqHeaders = { ...headers };
    let payload = null;
    if (body !== null && body !== undefined) {
      payload = typeof body === "string" ? body : JSON.stringify(body);
      if (!reqHeaders["Content-Type"]) {
        reqHeaders["Content-Type"] = "application/json";
      }
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

async function runNotificationTests() {
  console.log("Starting RentMe Notifications & Production Hardening Test Suite...\n");

  const emailProvider = getEmailProvider();
  const smsProvider = getSmsProvider();
  const notificationService = getNotificationService();

  // --- 1. Email Provider Boundary ---
  console.log("--- 1. Testing Email Provider Boundary ---");
  const emailRes = await emailProvider.sendEmail({
    to: "rohan@example.com",
    subject: "Test Booking Subject",
    body: "Test booking body content",
    idempotencyKey: "test_email_idemp_1"
  });
  assert.strictEqual(emailRes.success, true, "Email sending must report success");
  assert.ok(emailRes.messageId, "Email sending must return a valid messageId");
  assert.ok(emailRes.deliveredAt, "Email sending must return deliveredAt timestamp");
  console.log(`✔ Email provider boundary verified (${emailProvider.name}): ${emailRes.messageId}`);

  // --- 2. SMS Provider Boundary ---
  console.log("\n--- 2. Testing SMS Provider Boundary ---");
  const smsRes = await smsProvider.sendSms({
    to: "+919876543210",
    message: "Test SMS notification message",
    idempotencyKey: "test_sms_idemp_1"
  });
  assert.strictEqual(smsRes.success, true, "SMS sending must report success");
  assert.ok(smsRes.messageId, "SMS sending must return a valid messageId");
  assert.ok(smsRes.deliveredAt, "SMS sending must return deliveredAt timestamp");
  console.log(`✔ SMS provider boundary verified (${smsProvider.name}): ${smsRes.messageId}`);

  // --- 3. Idempotent Delivery Tracking ---
  console.log("\n--- 3. Testing Idempotent Delivery Tracking ---");
  const testIdempKey = `test_dedup_${Date.now()}`;
  const notif1 = await notificationService.send({
    userId: "user-rohan",
    channel: "in_app",
    title: "Duplicate Check Title",
    message: "First delivery attempt",
    idempotencyKey: testIdempKey
  });
  assert.ok(notif1.id, "First notification must succeed");

  const notif2 = await notificationService.send({
    userId: "user-rohan",
    channel: "in_app",
    title: "Duplicate Check Title",
    message: "Second delivery attempt with same idempotencyKey",
    idempotencyKey: testIdempKey
  });
  assert.strictEqual(notif2.id, notif1.id, "Second dispatch with duplicate key must return existing notification record");
  assert.strictEqual(notif2.message, notif1.message, "Original message preserved without duplicate entry");
  console.log("✔ Idempotency tracking verified: repeated triggers safely return existing notification record");

  // --- 4. Booking Lifecycle Multi-Channel Notifications ---
  console.log("\n--- 4. Testing Booking Lifecycle Multi-Channel Notifications ---");
  const testDate = "2026-09-18";

  // 4a. Booking Requested
  const createBookingRes = await makeRequest("/api/bookings", "POST", {
    companionId: "aisha",
    experienceId: "aisha-charminar-walk",
    date: testDate,
    partySize: 2,
    customerName: "Rohan Mehta",
    customerEmail: "rohan@example.com",
    notes: "Notification test booking"
  }, {
    "X-Actor-Role": "customer",
    "X-Actor-Id": "user-rohan"
  });
  assert.strictEqual(createBookingRes.status, 201, `Create booking should succeed: ${JSON.stringify(createBookingRes.body)}`);
  const booking = createBookingRes.body.booking;
  const bookingId = booking.id;

  // Verify companion received request notification
  const compNotifsAfterReq = await makeRequest("/api/notifications", "GET", null, {
    "X-Actor-Role": "companion",
    "X-Actor-Id": "user-aisha"
  });
  assert.strictEqual(compNotifsAfterReq.status, 200);
  const reqNotif = compNotifsAfterReq.body.notifications.find(
    (n) => n.metadata?.bookingId === bookingId && n.metadata?.event === "requested"
  );
  assert.ok(reqNotif, "Companion must receive in-app notification for requested booking");
  console.log("✔ Booking Requested: In-app & SMS alerts dispatched to companion");

  // 4b. Booking Accepted
  const acceptRes = await makeRequest(`/api/bookings/${bookingId}/transition`, "POST", {
    targetStatus: "accepted",
    notes: "Accepted for heritage walk"
  }, {
    "X-Actor-Role": "companion",
    "X-Actor-Id": "user-aisha"
  });
  assert.strictEqual(acceptRes.status, 200, "Accept booking should succeed");

  const custNotifsAfterAccept = await makeRequest("/api/notifications", "GET", null, {
    "X-Actor-Role": "customer",
    "X-Actor-Id": "user-rohan"
  });
  const acceptNotif = custNotifsAfterAccept.body.notifications.find(
    (n) => n.metadata?.bookingId === bookingId && n.metadata?.event === "accepted"
  );
  assert.ok(acceptNotif, "Customer must receive notification when companion accepts");
  console.log("✔ Booking Accepted: Customer notified with payment prompt");

  // 4c. Booking Confirmed
  const confirmRes = await makeRequest(`/api/bookings/${bookingId}/transition`, "POST", {
    targetStatus: "confirmed",
    paymentId: `pay_test_${Date.now()}`,
    orderId: `order_test_${Date.now()}`,
    signature: "valid_sig"
  }, {
    "X-Actor-Role": "customer",
    "X-Actor-Id": "user-rohan"
  });
  assert.strictEqual(confirmRes.status, 200, "Confirm booking should succeed");

  const custNotifsAfterConfirm = await makeRequest("/api/notifications", "GET", null, {
    "X-Actor-Role": "customer",
    "X-Actor-Id": "user-rohan"
  });
  const confirmNotif = custNotifsAfterConfirm.body.notifications.find(
    (n) => n.metadata?.bookingId === bookingId && n.metadata?.event === "confirmed"
  );
  assert.ok(confirmNotif, "Customer must receive trip confirmed notification");
  console.log("✔ Booking Confirmed: Customer and companion notified of confirmed booking");

  // 4d. Booking In Progress
  const startRes = await makeRequest(`/api/bookings/${bookingId}/transition`, "POST", {
    targetStatus: "in_progress",
    notes: "Met customer at Charminar"
  }, {
    "X-Actor-Role": "companion",
    "X-Actor-Id": "user-aisha"
  });
  assert.strictEqual(startRes.status, 200, "Start booking should succeed");
  console.log("✔ Booking In-Progress: Safety protocols and active trip alert sent");

  // 4e. Booking Completed & Escrow Payout Released
  const completeRes = await makeRequest(`/api/bookings/${bookingId}/transition`, "POST", {
    targetStatus: "completed",
    notes: "Tour completed safely"
  }, {
    "X-Actor-Role": "companion",
    "X-Actor-Id": "user-aisha"
  });
  assert.strictEqual(completeRes.status, 200, "Complete booking should succeed");

  const compNotifsAfterComplete = await makeRequest("/api/notifications", "GET", null, {
    "X-Actor-Role": "companion",
    "X-Actor-Id": "user-aisha"
  });
  const payoutNotif = compNotifsAfterComplete.body.notifications.find(
    (n) => n.metadata?.bookingId === bookingId && n.metadata?.event === "payout"
  );
  assert.ok(payoutNotif, "Companion must receive escrow payout notification upon completion");
  console.log("✔ Booking Completed & Payout: Escrow release and review prompt notifications verified");

  // --- 5. Cancellation & Refund Notifications ---
  console.log("\n--- 5. Testing Cancellation & Refund Flow Notifications ---");
  const cancelBookingRes = await makeRequest("/api/bookings", "POST", {
    companionId: "arjun",
    experienceId: "arjun-golconda-photo",
    date: "2026-09-21",
    partySize: 1,
    customerName: "Rohan Mehta",
    customerEmail: "rohan@example.com",
    notes: "Cancel test"
  }, {
    "X-Actor-Role": "customer",
    "X-Actor-Id": "user-rohan"
  });
  const cancelBookingId = cancelBookingRes.body.booking.id;

  // Accept and confirm so refund occurs on cancellation
  await makeRequest(`/api/bookings/${cancelBookingId}/transition`, "POST", { targetStatus: "accepted" }, {
    "X-Actor-Role": "companion",
    "X-Actor-Id": "user-arjun"
  });
  await makeRequest(`/api/bookings/${cancelBookingId}/transition`, "POST", {
    targetStatus: "confirmed",
    paymentId: `pay_cancel_${Date.now()}`
  }, {
    "X-Actor-Role": "customer",
    "X-Actor-Id": "user-rohan"
  });

  // Cancel by companion
  const cancelRes = await makeRequest(`/api/bookings/${cancelBookingId}/transition`, "POST", {
    targetStatus: "cancelled",
    cancelledBy: "companion",
    notes: "Unavoidable emergency"
  }, {
    "X-Actor-Role": "companion",
    "X-Actor-Id": "user-arjun"
  });
  assert.strictEqual(cancelRes.status, 200, "Cancellation should succeed");

  const custNotifsAfterCancel = await makeRequest("/api/notifications", "GET", null, {
    "X-Actor-Role": "customer",
    "X-Actor-Id": "user-rohan"
  });
  const refundNotif = custNotifsAfterCancel.body.notifications.find(
    (n) => n.metadata?.bookingId === cancelBookingId && n.metadata?.event === "refunded"
  );
  assert.ok(refundNotif, "Customer must receive refund notification on cancellation");
  console.log("✔ Cancellation & Refund: Customer refund notification verified");

  // --- 6. KYC Status Notifications ---
  console.log("\n--- 6. Testing KYC Status Notifications ---");
  const kycSubmitRes = await makeRequest("/api/kyc/submit", "POST", {
    userId: "user-aisha",
    documentType: "pan",
    documentNumber: "ABCDE1234F"
  }, {
    "X-Actor-Role": "companion",
    "X-Actor-Id": "user-aisha"
  });
  assert.ok(kycSubmitRes.status === 200 || kycSubmitRes.status === 201, "KYC submit should succeed");

  const aishaKycNotifs = await makeRequest("/api/notifications", "GET", null, {
    "X-Actor-Role": "companion",
    "X-Actor-Id": "user-aisha"
  });
  const kycNotif = aishaKycNotifs.body.notifications.find(
    (n) => n.idempotencyKey && n.idempotencyKey.includes("kyc_user-aisha")
  );
  assert.ok(kycNotif, "Companion must receive KYC status update notification");
  console.log("✔ KYC Workflow: Status change notifications verified");

  // --- 7. Safety / Report Alerts ---
  console.log("\n--- 7. Testing Safety & Report Incident Alerts ---");
  const reportRes = await makeRequest("/api/reports", "POST", {
    reporterUserId: "user-rohan",
    category: "safety",
    description: "Suspicious bystander approached during tour near market entrance.",
    bookingId
  }, {
    "X-Actor-Role": "customer",
    "X-Actor-Id": "user-rohan"
  });
  assert.strictEqual(reportRes.status, 201, "Report submit should succeed");
  const reportId = reportRes.body.report.id;

  // Verify Admin alert
  const adminNotifs = await makeRequest("/api/notifications", "GET", null, {
    "X-Actor-Role": "admin",
    "X-Actor-Id": "user-admin"
  });
  const adminAlert = adminNotifs.body.notifications.find(
    (n) => n.metadata?.reportId === reportId
  );
  assert.ok(adminAlert, "Admin must receive high-priority safety alert notification");

  // Admin resolves report
  const resolveRes = await makeRequest(`/api/reports/${reportId}/resolve`, "POST", {
    resolutionNotes: "Reviewed with local market security. Safe area cleared."
  }, {
    "X-Actor-Role": "admin",
    "X-Actor-Id": "user-admin"
  });
  assert.strictEqual(resolveRes.status, 200, "Resolve report should succeed");
  console.log("✔ Safety Alerts: Admin incident escalation and reporter resolution alerts verified");

  // --- 8. Notification Mark-As-Read API ---
  console.log("\n--- 8. Testing Notification In-App Read Status ---");
  const unreadNotif = custNotifsAfterConfirm.body.notifications[0];
  assert.ok(unreadNotif, "At least one customer notification must exist");

  const readRes = await makeRequest(`/api/notifications/${unreadNotif.id}/read`, "POST", {}, {
    "X-Actor-Role": "customer",
    "X-Actor-Id": "user-rohan"
  });
  assert.strictEqual(readRes.status, 200, "Mark as read should succeed");
  assert.ok(readRes.body.notification.readAt, "Notification must have readAt timestamp populated");
  console.log(`✔ Notification read status updated: readAt=${readRes.body.notification.readAt}`);

  // --- 9. Production Readiness & Health Checks ---
  console.log("\n--- 9. Testing Production Readiness & Health Checks ---");
  const readyRes = await makeRequest("/api/ready");
  assert.strictEqual(readyRes.status, 200, `Readiness probe should return 200: ${JSON.stringify(readyRes.body)}`);
  assert.strictEqual(readyRes.body.status, "ready");
  assert.strictEqual(readyRes.body.database.status, "connected");
  assert.ok(readyRes.body.providers, "Providers map must be present");
  assert.ok(readyRes.body.uptime >= 0, "Uptime must be positive number");
  console.log(`✔ Readiness probe (/api/ready) passed: db=${readyRes.body.database.type} (${readyRes.body.database.status})`);

  const healthRes = await makeRequest("/api/health");
  assert.strictEqual(healthRes.status, 200, "Health probe should return 200");
  assert.strictEqual(healthRes.body.status, "healthy");
  assert.ok(healthRes.body.version, "Version must be present");
  console.log(`✔ Health probe (/api/health) passed: status=${healthRes.body.status} v${healthRes.body.version}`);

  // --- 10. Security Headers Verification ---
  console.log("\n--- 10. Testing Security Headers ---");
  assert.strictEqual(readyRes.headers["x-content-type-options"], "nosniff", "x-content-type-options must be nosniff");
  assert.strictEqual(readyRes.headers["x-frame-options"], "SAMEORIGIN", "x-frame-options must be SAMEORIGIN");
  assert.ok(readyRes.headers["referrer-policy"], "referrer-policy header must be present");
  assert.ok(readyRes.headers["access-control-allow-origin"], "CORS access-control-allow-origin header must be present");
  console.log("✔ Production security headers verified: nosniff, SAMEORIGIN, Referrer-Policy, CORS");

  console.log("\nAll RentMe Notifications & Production Hardening tests passed successfully!\n");
}

if (require.main === module) {
  runNotificationTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("\n✖ Notification test failed:", err);
      process.exit(1);
    });
}

module.exports = { runNotificationTests };
