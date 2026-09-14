const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

if (typeof process.loadEnvFile === "function") {
  const envPath = path.resolve(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
    } catch {}
  }
}

let handleApiRequest = null;
let initDatabase = null;
let closeDatabase = null;
try {
  ({ handleApiRequest } = require("./dist/api/router.js"));
  ({ initDatabase, closeDatabase } = require("./dist/db/database.js"));
} catch (err) {
  console.warn("Backend API router not loaded from ./dist. Make sure TypeScript is compiled.", err.message);
}

const root = __dirname;
const port = Number(process.env.PORT || 5173);
const isProd = process.env.NODE_ENV === "production";
const corsOrigin = process.env.CORS_ORIGIN || "*";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function getSecurityHeaders() {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Actor-Role, X-Actor-Id",
    "Access-Control-Max-Age": "86400"
  };
  if (isProd) {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }
  return headers;
}

function send(res, status, body, type) {
  const headers = {
    ...getSecurityHeaders(),
    "Content-Type": type,
    "Cache-Control": "no-store"
  };
  res.writeHead(status, headers);
  res.end(body);
}

function resolveFile(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]);
  const requested = cleanPath === "/" ? "/index.html" : cleanPath;
  const filePath = path.normalize(path.join(root, requested));

  if (!filePath.startsWith(root)) {
    return null;
  }

  return filePath;
}

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight centrally
  if (req.method === "OPTIONS") {
    res.writeHead(204, getSecurityHeaders());
    res.end();
    return;
  }

  // Check if this is an API route
  if (handleApiRequest && (req.url.startsWith("/api/") || req.url === "/api")) {
    try {
      const handled = await handleApiRequest(req, res);
      if (handled) return;
    } catch (err) {
      const safeMessage = isProd ? "Internal Server Error" : err.message;
      send(res, 500, JSON.stringify({ error: safeMessage, success: false }), "application/json; charset=utf-8");
      return;
    }
  }

  const filePath = resolveFile(req.url || "/");

  if (!filePath) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      if (error.code === "ENOENT") {
        send(res, 404, "Not found", "text/plain; charset=utf-8");
        return;
      }

      send(res, 500, "Server error", "text/plain; charset=utf-8");
      return;
    }

    send(res, 200, contents, types[path.extname(filePath)] || "application/octet-stream");
  });
});

// Graceful Shutdown
let isShuttingDown = false;
function handleGracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Server] Received ${signal}. Initiating graceful shutdown...`);

  server.close(async () => {
    console.log("[Server] HTTP connections closed.");
    try {
      if (closeDatabase) {
        await closeDatabase();
        console.log("[Database] Database connection pool closed.");
      }
    } catch (err) {
      console.warn("[Database] Shutdown warning:", err.message);
    }
    process.exit(0);
  });

  // Force shutdown if connections do not drain in 10s
  setTimeout(() => {
    console.error("[Server] Graceful shutdown timeout (10s) exceeded. Forcing exit.");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => handleGracefulShutdown("SIGTERM"));
process.on("SIGINT", () => handleGracefulShutdown("SIGINT"));

// Process Error Handlers
process.on("unhandledRejection", (reason) => {
  console.error("[Process] Unhandled Rejection:", reason instanceof Error ? reason.message : reason);
});
process.on("uncaughtException", (err) => {
  console.error("[Process] Uncaught Exception:", err.message);
});

const shouldListen = require.main === module || (!process.env.TARGET_PORT && !process.env.SKIP_SERVER_LISTEN);
if (shouldListen) {
  server.listen(port, () => {
    console.log(`RentMe is running at http://localhost:${port} (${isProd ? "production" : "development"} mode)`);
    if (initDatabase) {
      initDatabase().catch((err) => {
        console.error("[Database] Initialization warning:", err.message);
      });
    }
  });
}

module.exports = { server, resolveFile, types, send, handleGracefulShutdown, getSecurityHeaders };

