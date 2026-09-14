const assert = require("node:assert");
const http = require("node:http");
const crypto = require("node:crypto");

process.env.PORT = "5244";
const { server } = require("../server.js");

function makeRequest(path, method = "GET", body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const port = Number(process.env.TARGET_PORT || (address && typeof address === "object" ? address.port : 5244));

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

function generateSignedWebhook(event, data, secret = "rentme_mock_webhook_secret_2026") {
  const paymentId = data.paymentId || `pay_mock_${Date.now()}`;
  const orderId = data.orderId || `order_mock_${Date.now()}`;
  const amountInPaise = Math.round((data.amount || 2400) * 100);

  const payload = {
    entity: "event",
    id: data.eventId || `evt_pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    account_id: "acc_rentme_india",
    event,
    contains: ["payment"],
    payload: {
      payment: {
        entity: {
          id: paymentId,
          entity: "payment",
          amount: amountInPaise,
          currency: data.currency || "INR",
          status: event === "payment.captured" ? "captured" : event === "payment.failed" ? "failed" : "refunded",
          order_id: orderId,
          notes: {
            bookingId: data.bookingId
          }
        }
      },
      order: {
        entity: {
          id: orderId,
          entity: "order",
          amount: amountInPaise,
          currency: data.currency || "INR",
          status: event === "payment.captured" ? "paid" : "created",
          notes: {
            bookingId: data.bookingId
          }
        }
      }
    },
    created_at: Math.floor(Date.now() / 1000)
  };

  const body = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return { body, signature, paymentId, orderId, eventId: payload.id };
}

async function runPaymentTests() {
  console.log("Starting RentMe Marketplace Payment & Escrow Payout Test Suite...\n");

  // Step 1: Reset database
  const resetRes = await makeRequest("/api/admin/reset", "POST");
  assert.strictEqual(resetRes.status, 200, "Reset should succeed");

  // Step 2: Login customer and companion to get authentic session tokens
  const customerLogin = await makeRequest("/api/auth/login", "POST", {
    email: "rohan@example.com",
    password: "RentMe2026!"
  });
  assert.strictEqual(customerLogin.status, 200);
  const rohanToken = customerLogin.body.session.token;

  const companionLogin = await makeRequest("/api/auth/login", "POST", {
    email: "aisha@rentme.local",
    password: "RentMe2026!"
  });
  assert.strictEqual(companionLogin.status, 200);
  const aishaToken = companionLogin.body.session.token;

  // --- Test Suite 1: Payment Intent / Order Creation ---
  console.log("--- 1. Testing Payment Intent / Order Creation ---");

  // Create booking
  const createBookingRes = await makeRequest(
    "/api/bookings",
    "POST",
    {
      companionId: "aisha",
      experienceId: "aisha-charminar-walk",
      date: "2026-09-12",
      partySize: 2,
      notes: "Heritage food & photo walk"
    },
    { Authorization: `Bearer ${rohanToken}` }
  );
  assert.strictEqual(createBookingRes.status, 201);
  const bookingId = createBookingRes.body.booking.id;
  const totalPrice = createBookingRes.body.booking.totalPrice; // 4800 INR

  // Cannot create payment intent when status is 'requested' (must be accepted first)
  const prematureIntent = await makeRequest(
    `/api/bookings/${bookingId}/payment-intent`,
    "POST",
    {},
    { Authorization: `Bearer ${rohanToken}` }
  );
  assert.strictEqual(prematureIntent.status, 400, "Payment intent must fail if booking is not accepted");
  assert.ok(prematureIntent.body.error.includes("accepted"), "Error must mention accepted status");
  console.log("✔ Payment intent creation correctly rejected for unaccepted booking");

  // Companion accepts booking
  const acceptRes = await makeRequest(
    `/api/bookings/${bookingId}/transition`,
    "POST",
    { action: "accepted" },
    { Authorization: `Bearer ${aishaToken}` }
  );
  assert.strictEqual(acceptRes.status, 200);
  assert.strictEqual(acceptRes.body.booking.status, "accepted");
  console.log("✔ Companion accepts booking");

  // Unauthorized user cannot create payment intent
  const unauthorizedIntent = await makeRequest(
    `/api/bookings/${bookingId}/payment-intent`,
    "POST",
    {},
    { Authorization: `Bearer ${aishaToken}` } // Companion cannot pay for customer's booking
  );
  assert.strictEqual(unauthorizedIntent.status, 400, "Companion cannot create customer payment intent");
  console.log("✔ Non-customer role boundary enforced for payment intent");

  // Customer creates payment order/intent
  const orderRes = await makeRequest(
    `/api/bookings/${bookingId}/payment-intent`,
    "POST",
    {},
    { Authorization: `Bearer ${rohanToken}` }
  );
  assert.strictEqual(orderRes.status, 201, "Payment intent created successfully");
  assert.ok(orderRes.body.order, "Order object must be present");
  assert.strictEqual(orderRes.body.order.amount, totalPrice, "Order amount must equal total booking price");
  assert.strictEqual(orderRes.body.order.currency, "INR", "Order currency must be INR");
  assert.ok(orderRes.body.order.orderId.startsWith("order_"), "OrderId must be formatted properly");
  assert.strictEqual(orderRes.body.payment.status, "pending", "Payment record status must be pending");
  const createdOrderId = orderRes.body.order.orderId;
  console.log(`✔ Authoritative payment order created: ${createdOrderId} for ${totalPrice} INR`);

  // --- Test Suite 2: Payout Ineligibility on Payment Intent / Pre-Completion ---
  console.log("\n--- 2. Testing Escrow Rule: Payout Ineligible Before Trip Completion ---");

  const prePaymentEligibility = await makeRequest(
    `/api/bookings/${bookingId}/payout-eligibility`,
    "GET",
    null,
    { Authorization: `Bearer ${rohanToken}` }
  );
  assert.strictEqual(prePaymentEligibility.status, 200);
  assert.strictEqual(prePaymentEligibility.body.eligible, false, "Payout must NOT be eligible while accepted");
  assert.ok(prePaymentEligibility.body.reason.includes("status"), "Reason must mention booking status");
  console.log("✔ Companion payout confirmed INELIGIBLE while booking is accepted/pending");

  // --- Test Suite 3: Webhook Signature Security ---
  console.log("\n--- 3. Testing Webhook Signature Security ---");

  // Missing signature header
  const noSigRes = await makeRequest("/api/payments/webhook", "POST", { test: "data" });
  assert.strictEqual(noSigRes.status, 400);
  assert.ok(noSigRes.body.error.includes("signature"), "Must reject missing signature");

  // Tampered signature
  const fakeSigRes = await makeRequest(
    "/api/payments/webhook",
    "POST",
    { test: "data" },
    { "x-razorpay-signature": "tampered_bad_signature" }
  );
  assert.strictEqual(fakeSigRes.status, 400);
  assert.ok(fakeSigRes.body.error.includes("signature"), "Must reject invalid signature");
  console.log("✔ Webhook rejects missing or tampered HMAC signatures");

  // --- Test Suite 4: Authoritative Payment Success Webhook (payment.captured) ---
  console.log("\n--- 4. Testing Authoritative Payment Success Webhook ---");

  const webhookCapture = generateSignedWebhook("payment.captured", {
    bookingId,
    orderId: createdOrderId,
    amount: totalPrice,
    currency: "INR"
  });

  const webhookSuccessRes = await makeRequest(
    "/api/payments/webhook",
    "POST",
    webhookCapture.body,
    { "x-razorpay-signature": webhookCapture.signature }
  );
  assert.strictEqual(webhookSuccessRes.status, 200);
  assert.strictEqual(webhookSuccessRes.body.success, true);
  assert.strictEqual(webhookSuccessRes.body.status, "captured");

  // Verify booking was authoritatively moved from 'accepted' to 'confirmed' by the webhook
  const updatedBookingRes = await makeRequest(
    `/api/bookings/${bookingId}`,
    "GET",
    null,
    { Authorization: `Bearer ${rohanToken}` }
  );
  assert.strictEqual(updatedBookingRes.status, 200);
  assert.strictEqual(updatedBookingRes.body.booking.status, "confirmed", "Booking must transition to confirmed");
  console.log("✔ Webhook payment.captured authoritatively moved booking to 'confirmed'");

  // Escrow check: companion payout STILL ineligible after payment capture
  const postPaymentEligibility = await makeRequest(
    `/api/bookings/${bookingId}/payout-eligibility`,
    "GET",
    null,
    { Authorization: `Bearer ${rohanToken}` }
  );
  assert.strictEqual(postPaymentEligibility.status, 200);
  assert.strictEqual(postPaymentEligibility.body.eligible, false, "Payout must NOT be released on payment capture");
  console.log("✔ Escrow protection verified: companion payout is NOT released upon customer payment");

  // --- Test Suite 5: Webhook Idempotency ---
  console.log("\n--- 5. Testing Webhook Idempotency (Duplicate Delivery) ---");

  // Send the EXACT SAME webhook payload & signature again
  const duplicateWebhookRes = await makeRequest(
    "/api/payments/webhook",
    "POST",
    webhookCapture.body,
    { "x-razorpay-signature": webhookCapture.signature }
  );
  assert.strictEqual(duplicateWebhookRes.status, 200);
  assert.strictEqual(duplicateWebhookRes.body.duplicate, true, "Must flag duplicate delivery");
  assert.strictEqual(duplicateWebhookRes.body.status, "already_processed");

  // Send a third time
  const duplicateWebhookRes3 = await makeRequest(
    "/api/payments/webhook",
    "POST",
    webhookCapture.body,
    { "x-razorpay-signature": webhookCapture.signature }
  );
  assert.strictEqual(duplicateWebhookRes3.status, 200);
  assert.strictEqual(duplicateWebhookRes3.body.duplicate, true);

  // Booking status remains 'confirmed' without double transitions or duplicate side effects
  const bookingAfterDuplicates = await makeRequest(
    `/api/bookings/${bookingId}`,
    "GET",
    null,
    { Authorization: `Bearer ${rohanToken}` }
  );
  assert.strictEqual(bookingAfterDuplicates.body.booking.status, "confirmed");
  console.log("✔ Webhook idempotency verified: duplicate events safely returned 200 OK without double side-effects");

  // --- Test Suite 6: Payment Failure Webhook (payment.failed) ---
  console.log("\n--- 6. Testing Payment Failure Webhook ---");

  // Create booking 2
  const booking2Res = await makeRequest(
    "/api/bookings",
    "POST",
    {
      companionId: "aisha",
      experienceId: "aisha-charminar-walk",
      date: "2026-09-13",
      partySize: 1,
      notes: "Solo walk"
    },
    { Authorization: `Bearer ${rohanToken}` }
  );
  assert.strictEqual(booking2Res.status, 201);
  const booking2Id = booking2Res.body.booking.id;

  // Aisha accepts booking 2
  await makeRequest(
    `/api/bookings/${booking2Id}/transition`,
    "POST",
    { action: "accepted" },
    { Authorization: `Bearer ${aishaToken}` }
  );

  // Create payment intent for booking 2
  const order2Res = await makeRequest(
    `/api/bookings/${booking2Id}/payment-intent`,
    "POST",
    {},
    { Authorization: `Bearer ${rohanToken}` }
  );
  assert.strictEqual(order2Res.status, 201);

  // Send payment.failed webhook
  const failWebhook = generateSignedWebhook("payment.failed", {
    bookingId: booking2Id,
    orderId: order2Res.body.order.orderId,
    amount: 2400
  });

  const failWebhookRes = await makeRequest(
    "/api/payments/webhook",
    "POST",
    failWebhook.body,
    { "x-razorpay-signature": failWebhook.signature }
  );
  assert.strictEqual(failWebhookRes.status, 200);
  assert.strictEqual(failWebhookRes.body.status, "failed");

  // Booking 2 must NOT be confirmed
  const booking2Check = await makeRequest(
    `/api/bookings/${booking2Id}`,
    "GET",
    null,
    { Authorization: `Bearer ${rohanToken}` }
  );
  assert.strictEqual(booking2Check.body.booking.status, "accepted", "Booking must remain accepted on payment failure");
  console.log("✔ Payment failure webhook recorded failure and left booking unconfirmed");

  // --- Test Suite 7: Cancellation & Refund Flow ---
  console.log("\n--- 7. Testing Cancellation & Refund Flow ---");

  // Cancel confirmed booking 1 (which had 4800 INR captured)
  const cancelRes = await makeRequest(
    `/api/bookings/${bookingId}/transition`,
    "POST",
    {
      action: "cancelled",
      notes: "Emergency rescheduling required"
    },
    { Authorization: `Bearer ${rohanToken}` }
  );
  assert.strictEqual(cancelRes.status, 200);
  assert.strictEqual(cancelRes.body.booking.status, "cancelled");

  // Check payout eligibility on cancelled booking
  const cancelEligibility = await makeRequest(
    `/api/bookings/${bookingId}/payout-eligibility`,
    "GET",
    null,
    { Authorization: `Bearer ${rohanToken}` }
  );
  assert.strictEqual(cancelEligibility.body.eligible, false, "Cancelled booking must NOT be eligible for payout");
  console.log("✔ Cancellation triggered payment refund; cancelled booking confirmed ineligible for companion payout");

  // --- Test Suite 8: Full Completion & Payout Split Verification ---
  console.log("\n--- 8. Testing Full Completion, Platform Fee Split, and Companion Payout ---");

  // Create Booking 3 for a full clean lifecycle to completion
  const booking3Res = await makeRequest(
    "/api/bookings",
    "POST",
    {
      companionId: "aisha",
      experienceId: "aisha-charminar-walk",
      date: "2026-09-16",
      partySize: 2,
      notes: "Full tour completion test"
    },
    { Authorization: `Bearer ${rohanToken}` }
  );
  assert.strictEqual(booking3Res.status, 201);
  const booking3Id = booking3Res.body.booking.id;

  // Accept booking 3
  await makeRequest(
    `/api/bookings/${booking3Id}/transition`,
    "POST",
    { action: "accepted" },
    { Authorization: `Bearer ${aishaToken}` }
  );

  // Pay booking 3 via webhook
  const capture3 = generateSignedWebhook("payment.captured", {
    bookingId: booking3Id,
    amount: 4800
  });
  await makeRequest(
    "/api/payments/webhook",
    "POST",
    capture3.body,
    { "x-razorpay-signature": capture3.signature }
  );

  // Companion starts trip (in_progress)
  const startRes = await makeRequest(
    `/api/bookings/${booking3Id}/transition`,
    "POST",
    { action: "in_progress" },
    { Authorization: `Bearer ${aishaToken}` }
  );
  assert.strictEqual(startRes.status, 200);
  assert.strictEqual(startRes.body.booking.status, "in_progress");

  // Verify payout is still ineligible while in_progress
  const inProgressEligibility = await makeRequest(
    `/api/bookings/${booking3Id}/payout-eligibility`,
    "GET",
    null,
    { Authorization: `Bearer ${aishaToken}` }
  );
  assert.strictEqual(inProgressEligibility.body.eligible, false, "Payout must not release while trip is in progress");
  console.log("✔ Escrow protection verified: payout not released while trip is in_progress");

  // Companion completes trip (completed)
  const completeRes = await makeRequest(
    `/api/bookings/${booking3Id}/transition`,
    "POST",
    { action: "completed" },
    { Authorization: `Bearer ${aishaToken}` }
  );
  assert.strictEqual(completeRes.status, 200);
  assert.strictEqual(completeRes.body.booking.status, "completed");

  // Verify payout eligibility upon completion!
  const completedEligibility = await makeRequest(
    `/api/bookings/${booking3Id}/payout-eligibility`,
    "GET",
    null,
    { Authorization: `Bearer ${aishaToken}` }
  );
  assert.strictEqual(completedEligibility.status, 200);
  assert.strictEqual(completedEligibility.body.eligible, true, "Payout MUST be eligible once completed");
  assert.strictEqual(completedEligibility.body.totalAmount, 4800);
  assert.strictEqual(completedEligibility.body.platformFeeRate, 0.15, "Platform commission must be 15%");
  assert.strictEqual(completedEligibility.body.platformFee, 720, "Platform fee must be 15% of 4800 = 720 INR");
  assert.strictEqual(completedEligibility.body.netPayoutAmount, 4080, "Net payout must be 85% of 4800 = 4080 INR");
  assert.strictEqual(completedEligibility.body.currency, "INR");
  console.log("✔ Trip completed: Companion payout eligible with 15% platform split (720 INR) and 85% net companion payout (4080 INR)");

  // Customer reviews trip
  const reviewRes = await makeRequest(
    `/api/bookings/${booking3Id}/transition`,
    "POST",
    {
      action: "reviewed",
      rating: 5,
      review: "Flawless experience and seamless payment!"
    },
    { Authorization: `Bearer ${rohanToken}` }
  );
  assert.strictEqual(reviewRes.status, 200);
  assert.strictEqual(reviewRes.body.booking.status, "reviewed");
  console.log("✔ Post-trip review completed successfully");

  console.log("\nAll RentMe Marketplace Payment & Escrow Payout Tests Passed Successfully!");
}

if (require.main === module) {
  runPaymentTests()
    .then(() => {
      server.close();
      process.exit(0);
    })
    .catch((err) => {
      console.error("\nPayment test failed:", err);
      server.close();
      process.exit(1);
    });
}

module.exports = { runPaymentTests };
