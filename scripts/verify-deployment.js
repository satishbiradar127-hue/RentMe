const https = require("node:https");
const http = require("node:http");
const { loadEnv, maskDatabaseUrl } = require("./env.js");

loadEnv();

const PUBLIC_URL = process.env.PUBLIC_URL || "https://rentme-marketplace.loca.lt";
const LOCAL_PORT = Number(process.env.PORT || 5173);

async function request(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const client = url.protocol === "https:" ? https : http;
    const reqHeaders = {
      "bypass-tunnel-reminder": "1",
      ...(options.headers || {})
    };
    const req = client.request(
      url,
      {
        method: options.method || "GET",
        headers: reqHeaders,
        timeout: options.timeout || 15000
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: body });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout connecting to ${urlStr}`));
    });
    if (options.body) {
      req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runDeploymentVerification() {
  console.log("===============================================================");
  console.log("       RentMe Public Production Deployment Verification");
  console.log("===============================================================");
  console.log(`Public Target URL : ${PUBLIC_URL}`);
  console.log(`Localhost Target  : http://localhost:${LOCAL_PORT}`);
  console.log(`Database (Masked) : ${maskDatabaseUrl(process.env.DATABASE_URL)}`);
  console.log("===============================================================\n");

  const results = [];
  function record(name, passed, detail) {
    const icon = passed ? "✔ PASS" : "✖ FAIL";
    console.log(`  ${icon.padEnd(8)} ${name.padEnd(45)} ${detail ? `(${detail})` : ""}`);
    results.push({ name, passed, detail });
  }

  try {
    // 1. Public Health Probe
    console.log("[Verification 1/8] Public Health Probe...");
    const healthRes = await request(`${PUBLIC_URL}/api/health`);
    const healthOk = healthRes.status === 200 && healthRes.body && healthRes.body.status === "healthy";
    record("Public Health Probe (/api/health)", healthOk, `HTTP ${healthRes.status}, version ${healthRes.body?.version}`);

    // 2. Public Readiness Probe & Database Connectivity
    console.log("[Verification 2/8] Public Readiness Probe & Supabase DB...");
    const readyRes = await request(`${PUBLIC_URL}/api/ready`);
    const dbConnected = readyRes.body?.database?.type === "postgresql" && readyRes.body?.database?.status === "connected";
    const readyOk = readyRes.status === 200 && readyRes.body?.status === "ready" && dbConnected;
    record("Public Readiness Probe (/api/ready)", readyOk, `DB: ${readyRes.body?.database?.type} (${readyRes.body?.database?.status})`);

    // 3. Security Headers
    console.log("[Verification 3/8] Production Security Headers...");
    const nosniff = healthRes.headers["x-content-type-options"] === "nosniff";
    const frameOptions = healthRes.headers["x-frame-options"] === "SAMEORIGIN";
    const xss = healthRes.headers["x-xss-protection"] === "1; mode=block";
    const referrer = !!healthRes.headers["referrer-policy"];
    const headersOk = nosniff && frameOptions && xss && referrer;
    record("Production Security Headers", headersOk, "nosniff, SAMEORIGIN, 1; mode=block");

    // 4. Public Web Server & Frontend Static Assets
    console.log("[Verification 4/8] Public Frontend Web Server & Assets...");
    const htmlRes = await request(`${PUBLIC_URL}/`);
    const htmlOk = htmlRes.status === 200 && typeof htmlRes.body === "string" && htmlRes.body.includes("RentMe");
    record("Root Web Page (index.html)", htmlOk, `HTTP ${htmlRes.status}, ${htmlRes.raw?.length} bytes`);

    const cssRes = await request(`${PUBLIC_URL}/src/styles.css`);
    const cssOk = cssRes.status === 200 && typeof cssRes.body === "string" && cssRes.body.length > 500;
    record("Frontend Stylesheet (src/styles.css)", cssOk, `HTTP ${cssRes.status}, ${cssRes.raw?.length} bytes`);

    const jsRes = await request(`${PUBLIC_URL}/src/app.js`);
    const jsOk = jsRes.status === 200 && typeof jsRes.body === "string" && jsRes.body.length > 500;
    record("Frontend App Script (src/app.js)", jsOk, `HTTP ${jsRes.status}, ${jsRes.raw?.length} bytes`);

    const heroRes = await request(`${PUBLIC_URL}/assets/hyderabad-hero.svg`);
    const heroOk = heroRes.status === 200 && heroRes.headers["content-type"]?.includes("image/svg+xml");
    record("Hero Branding Asset (assets/hyderabad-hero.svg)", heroOk, `HTTP ${heroRes.status}`);

    // 5. Public Auth Endpoint
    console.log("[Verification 5/8] Public Auth Session Endpoint...");
    const authRes = await request(`${PUBLIC_URL}/api/auth/session`);
    const authOk = authRes.status === 200 && authRes.body?.success === true;
    record("Auth Session Endpoint (/api/auth/session)", authOk, `HTTP ${authRes.status}`);

    const badAuthRes = await request(`${PUBLIC_URL}/api/auth/session`, {
      headers: { Authorization: "Bearer bad-token-12345" }
    });
    const badAuthOk = badAuthRes.status === 401;
    record("Auth Guard: Invalid Bearer Rejected", badAuthOk, `HTTP ${badAuthRes.status}`);

    // 6. Authoritative Marketplace API
    console.log("[Verification 6/8] Authoritative Discovery API...");
    const compsRes = await request(`${PUBLIC_URL}/api/companions`);
    const compsOk = compsRes.status === 200 && Array.isArray(compsRes.body?.companions) && compsRes.body.companions.length > 0;
    record("Companions Discovery (/api/companions)", compsOk, `HTTP ${compsRes.status}, ${compsRes.body?.count} companions`);

    const availRes = await request(`${PUBLIC_URL}/api/companions/comp-aisha-hyderabad/availability`);
    const availOk = availRes.status === 200 && availRes.body?.success === true;
    record("Companion Availability API", availOk, `HTTP ${availRes.status}`);

    const expRes = await request(`${PUBLIC_URL}/api/experiences`);
    const expOk = expRes.status === 200 && Array.isArray(expRes.body?.experiences);
    record("Marketplace Experiences API", expOk, `HTTP ${expRes.status}, ${expRes.body?.experiences?.length} items`);

    // 7. Payment Webhook Security Guard
    console.log("[Verification 7/8] Payment Security & Escrow Guard...");
    const webhookTamperRes = await request(`${PUBLIC_URL}/api/payments/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Razorpay-Signature": "invalid-signature-hash"
      },
      body: JSON.stringify({ event: "payment.captured", payload: {} })
    });
    const tamperOk = webhookTamperRes.status === 400;
    record("Payment Webhook HMAC Signature Guard", tamperOk, `HTTP ${webhookTamperRes.status} on tampered signature`);

    // 8. Notifications Endpoint
    console.log("[Verification 8/8] Notifications API...");
    const notifRes = await request(`${PUBLIC_URL}/api/notifications`);
    const notifOk = notifRes.status === 200 && notifRes.body?.success === true;
    record("Notifications In-App Endpoint", notifOk, `HTTP ${notifRes.status}`);

  } catch (err) {
    console.error("Verification encountered unexpected error:", err.message);
    record("Deployment Probe Suite", false, err.message);
  }

  // Summary
  console.log("\n===============================================================");
  console.log("           Deployment Verification Summary");
  console.log("===============================================================");
  const allPassed = results.every((r) => r.passed);
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`Passed: ${passedCount}/${results.length} checks`);
  console.log(`Public URL: ${PUBLIC_URL}`);
  console.log(`Overall Status: ${allPassed ? "VERIFIED & HEALTHY" : "FAILURES DETECTED"}`);
  console.log("===============================================================\n");

  if (!allPassed) {
    process.exit(1);
  }
}

if (require.main === module) {
  runDeploymentVerification().catch((err) => {
    console.error("Fatal deployment verification error:", err);
    process.exit(1);
  });
}

module.exports = { runDeploymentVerification };
