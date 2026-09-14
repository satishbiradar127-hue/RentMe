const http = require("node:http");
const { loadEnv } = require("./env.js");

loadEnv();

function checkReadinessOnce(port = 5173, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (result) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(result);
      }
    };

    const timer = setTimeout(() => {
      req.destroy();
      finish({ ok: false, error: "Readiness check timed out" });
    }, timeoutMs);

    const req = http.get(`http://127.0.0.1:${port}/api/ready`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode === 200 && parsed.status === "ready") {
            finish({ ok: true, statusCode: res.statusCode, body: parsed });
          } else {
            finish({
              ok: false,
              statusCode: res.statusCode,
              body: parsed,
              error: `HTTP ${res.statusCode}: ${parsed.error || "unready"}`
            });
          }
        } catch (e) {
          finish({ ok: false, statusCode: res.statusCode, error: e.message });
        }
      });
    });

    req.on("error", (err) => {
      finish({ ok: false, error: err.message });
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 5173);
  checkReadinessOnce(port)
    .then((res) => {
      if (res.ok) {
        console.log(`[Readiness] RentMe server on port ${port} is READY.`);
        console.log(`[Readiness] Database: ${res.body.database.type} (${res.body.database.status})`);
        console.log(`[Readiness] Providers: payment=${res.body.providers.payment}, email=${res.body.providers.email}, sms=${res.body.providers.sms}`);
        process.exit(0);
      } else {
        console.error(`[Readiness] RentMe server on port ${port} is NOT READY:`, res.error || res.statusCode);
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error("[Readiness] Check failed:", err.message);
      process.exit(1);
    });
}

module.exports = { checkReadinessOnce };
