const http = require("node:http");
const { loadEnv } = require("./env.js");

loadEnv();

function checkHealthOnce(port = 5173, timeoutMs = 2000) {
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
      finish({ ok: false, error: "Health check timed out" });
    }, timeoutMs);

    const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode === 200 && parsed.status === "healthy") {
            finish({ ok: true, statusCode: res.statusCode, body: parsed });
          } else {
            finish({ ok: false, statusCode: res.statusCode, body: parsed, error: `HTTP ${res.statusCode}` });
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

async function waitForHealth(port = 5173, maxWaitMs = 10000, intervalMs = 250) {
  const start = Date.now();
  let lastError = null;

  while (Date.now() - start < maxWaitMs) {
    const res = await checkHealthOnce(port, 1500);
    if (res.ok) {
      return { ok: true, durationMs: Date.now() - start, details: res.body };
    }
    lastError = res.error || `Status code ${res.statusCode}`;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return { ok: false, error: lastError || "Timed out waiting for server health" };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 5173);
  checkHealthOnce(port)
    .then((res) => {
      if (res.ok) {
        console.log(`[Health] RentMe server on port ${port} is HEALTHY.`);
        process.exit(0);
      } else {
        console.error(`[Health] RentMe server on port ${port} is NOT HEALTHY:`, res.error || res.statusCode);
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error("[Health] Check failed:", err.message);
      process.exit(1);
    });
}

module.exports = {
  checkHealthOnce,
  waitForHealth
};
