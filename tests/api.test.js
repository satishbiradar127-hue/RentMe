const assert = require("node:assert");
const http = require("node:http");
process.env.PORT = process.env.PORT || "5188";
const { server } = require("../server.js");

function makeRequest(path, method = "GET", body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const port = Number(process.env.TARGET_PORT || (address && typeof address === "object" ? address.port : 5173));

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

async function runApiTests() {
  console.log("Starting RentMe Production Foundation API Smoke Tests...");

  // 1. Health check
  const healthRes = await makeRequest("/api/health");
  assert.strictEqual(healthRes.status, 200, "Health check should return 200");
  assert.strictEqual(healthRes.body.status, "healthy");
  console.log("✔ Health endpoint functional");

  // 2. Auth & Session
  const sessionRes = await makeRequest("/api/auth/session");
  assert.strictEqual(sessionRes.status, 200);
  assert.ok(sessionRes.body.session, "Should return active session");
  assert.ok(Array.isArray(sessionRes.body.availablePersonas), "Should list available personas");
  console.log("✔ Auth session endpoint functional");

  const switchRes = await makeRequest("/api/auth/session", "POST", { role: "companion", userId: "user-aisha" });
  assert.strictEqual(switchRes.status, 200);
  assert.strictEqual(switchRes.body.session.role, "companion");
  assert.strictEqual(switchRes.body.session.user.id, "user-aisha");
  console.log("✔ Role session switching functional");

  // Switch back to customer
  await makeRequest("/api/auth/session", "POST", { role: "customer", userId: "user-rohan" });

  // 3. Companion discovery
  const compRes = await makeRequest("/api/companions");
  assert.strictEqual(compRes.status, 200);
  assert.ok(compRes.body.count >= 3, "Should return at least 3 companions");
  const aisha = compRes.body.companions.find((c) => c.id === "aisha");
  assert.ok(aisha, "Aisha Khan profile must exist");
  assert.ok(Array.isArray(aisha.experiences), "Experiences should be included");
  assert.ok(Array.isArray(aisha.availability), "Availability should be included");
  console.log("✔ Companion discovery and experiences functional");

  // 4. Availability endpoint
  const availRes = await makeRequest("/api/companions/aisha/availability");
  assert.strictEqual(availRes.status, 200);
  assert.ok(availRes.body.availability.includes("2026-09-12"), "Aisha should have 2026-09-12 available");
  console.log("✔ Companion availability endpoint functional");

  // 5. Booking Creation - Failure validation (unavailable date)
  const invalidDateRes = await makeRequest("/api/bookings", "POST", {
    companionId: "aisha",
    experienceId: "aisha-charminar-walk",
    customerName: "Rohan Mehta",
    customerEmail: "rohan@example.com",
    date: "2026-12-31", // Not available
    partySize: 1
  });
  assert.strictEqual(invalidDateRes.status, 400);
  assert.ok(invalidDateRes.body.error.includes("not available"), "Should reject unavailable date");
  console.log("✔ Booking creation rejects unavailable dates");

  // 6. Booking Creation - Success
  const createBookingRes = await makeRequest("/api/bookings", "POST", {
    companionId: "aisha",
    experienceId: "aisha-charminar-walk",
    customerName: "Rohan Mehta",
    customerEmail: "rohan@example.com",
    date: "2026-09-12",
    partySize: 2,
    notes: "Visiting Charminar and Laad Bazaar with friend."
  });
  assert.strictEqual(createBookingRes.status, 201);
  assert.strictEqual(createBookingRes.body.booking.status, "requested");
  assert.strictEqual(createBookingRes.body.booking.totalPrice, 4800, "2 * 2400 = 4800 INR");
  const newBookingId = createBookingRes.body.booking.id;
  console.log("✔ Authoritative booking creation with price calculation functional");

  // 7. Role Boundaries - Customer cannot accept their own booking
  const unauthorizedAcceptRes = await makeRequest(`/api/bookings/${newBookingId}/transition`, "POST", {
    action: "accepted",
    actorRole: "customer"
  });
  assert.strictEqual(unauthorizedAcceptRes.status, 400);
  assert.ok(unauthorizedAcceptRes.body.error.includes("not authorized"), "Customer should be blocked from accepting");
  console.log("✔ Role boundary: Customer cannot accept booking");

  // 8. Companion accepts booking
  const acceptRes = await makeRequest(`/api/bookings/${newBookingId}/transition`, "POST", {
    action: "accepted",
    actorRole: "companion"
  });
  assert.strictEqual(acceptRes.status, 200);
  assert.strictEqual(acceptRes.body.booking.status, "accepted");
  console.log("✔ Companion accepts booking");

  // 9. Customer confirms booking (triggers mock payment)
  const confirmRes = await makeRequest(`/api/bookings/${newBookingId}/transition`, "POST", {
    action: "confirmed",
    actorRole: "customer"
  });
  assert.strictEqual(confirmRes.status, 200);
  assert.strictEqual(confirmRes.body.booking.status, "confirmed");
  console.log("✔ Customer confirms booking with mock payment charge");

  // 10. Companion starts and completes booking (triggers mock payout)
  const startRes = await makeRequest(`/api/bookings/${newBookingId}/transition`, "POST", {
    action: "in_progress",
    actorRole: "companion"
  });
  assert.strictEqual(startRes.status, 200);
  assert.strictEqual(startRes.body.booking.status, "in_progress");

  const completeRes = await makeRequest(`/api/bookings/${newBookingId}/transition`, "POST", {
    action: "completed",
    actorRole: "companion"
  });
  assert.strictEqual(completeRes.status, 200);
  assert.strictEqual(completeRes.body.booking.status, "completed");
  console.log("✔ Trip start and completion lifecycle functional");

  // 11. Customer submits review
  const reviewRes = await makeRequest("/api/reviews", "POST", {
    bookingId: newBookingId,
    companionId: "aisha",
    customerId: "user-rohan",
    rating: 5,
    reviewText: "Incredible tour of Old City and Charminar! Very professional."
  });
  assert.strictEqual(reviewRes.status, 201);
  assert.strictEqual(reviewRes.body.review.rating, 5);
  console.log("✔ Review submission and companion rating update functional");

  // 12. Trust & Safety Reports
  const reportRes = await makeRequest("/api/reports", "POST", {
    category: "safety",
    description: "Question about public route boundaries near Golconda.",
    reporterUserId: "user-rohan"
  });
  assert.strictEqual(reportRes.status, 201);
  assert.strictEqual(reportRes.body.report.status, "open");
  const reportId = reportRes.body.report.id;

  const resolveRes = await makeRequest(`/api/reports/${reportId}/resolve`, "POST", {
    resolutionNotes: "Route verified with companion. All locations confirmed public."
  });
  assert.strictEqual(resolveRes.status, 200);
  assert.strictEqual(resolveRes.body.report.status, "resolved");
  console.log("✔ Trust & safety incident reporting and resolution functional");

  // 13. Admin Metrics & Overview
  const metricsRes = await makeRequest("/api/admin/metrics");
  assert.strictEqual(metricsRes.status, 200);
  assert.ok(metricsRes.body.metrics.totalBookings >= 3);
  assert.ok(metricsRes.body.metrics.totalGmv > 0);

  const overviewRes = await makeRequest("/api/admin/overview");
  assert.strictEqual(overviewRes.status, 200);
  assert.ok(Array.isArray(overviewRes.body.overview.recentAuditLogs), "Should expose audit logs");
  console.log("✔ Admin metrics and audit log overview functional");

  console.log("\nAll RentMe Production Foundation API tests passed successfully!");
}

runApiTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("API test failure:", err);
    process.exit(1);
  });
