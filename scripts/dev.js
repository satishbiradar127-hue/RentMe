const { spawn } = require("node:child_process");
const path = require("node:path");
const { loadEnv } = require("./env.js");
const { verifyDatabase } = require("./verify-db.js");
const { findPidOnPort, killPid } = require("./ensure-server.js");
const { checkHealthOnce, waitForHealth } = require("./health-check.js");

loadEnv();

const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 5173);
let serverChild = null;
let isShuttingDown = false;

function spawnServer() {
  const serverPath = path.join(rootDir, "server.js");
  const child = spawn(process.execPath, [serverPath], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(port) },
    stdio: "inherit"
  });

  child.on("exit", (code, signal) => {
    if (!isShuttingDown) {
      console.warn(`[Dev] Server process exited with code ${code || signal}. Respawning in 1s...`);
      setTimeout(() => {
        if (!isShuttingDown) {
          serverChild = spawnServer();
        }
      }, 1000);
    }
  });

  return child;
}

async function startDev() {
  console.log("=== RentMe Self-Running Development Environment ===");
  console.log(`Port: ${port}`);
  console.log(`Platform: ${process.platform}`);

  // 1. Connectivity & Schema Verification
  try {
    await verifyDatabase();
  } catch (err) {
    console.warn("[Dev] DB verification warning:", err.message);
  }

  // 2. Clear any stale process on target port
  const existingPid = findPidOnPort(port);
  if (existingPid) {
    console.log(`[Dev] Port ${port} is occupied by PID ${existingPid}. Releasing...`);
    killPid(existingPid);
    await new Promise((r) => setTimeout(r, 600));
  }

  // 3. Supervised Spawn
  console.log(`[Dev] Launching supervised server on port ${port}...`);
  serverChild = spawnServer();

  // 4. Wait for initial healthy state
  const health = await waitForHealth(port, 12000, 300);
  if (!health.ok) {
    console.error(`[Dev] Initial server boot unhealthy: ${health.error}`);
  } else {
    console.log(`[Dev] Server confirmed healthy at http://localhost:${port} in ${health.durationMs}ms`);
  }

  console.log("\n>>> RentMe Development Server is RUNNING at http://localhost:5173 <<<");
  console.log("Development loop active: auto-restarting on failure...\n");

  // 5. Health monitor loop
  const monitorInterval = setInterval(async () => {
    if (isShuttingDown) return;
    const h = await checkHealthOnce(port, 3000);
    if (!h.ok) {
      console.warn(`[Dev] Health check warning: ${h.error || h.statusCode}`);
      const pid = findPidOnPort(port);
      if (!pid && serverChild) {
        console.log("[Dev] Server process not listening. Restarting child...");
        try {
          serverChild.kill();
        } catch {}
        serverChild = spawnServer();
      }
    }
  }, 10000);

  // Clean exit handlers
  const cleanup = () => {
    isShuttingDown = true;
    clearInterval(monitorInterval);
    if (serverChild) {
      try {
        serverChild.kill();
      } catch {}
    }
    console.log("\n[Dev] Development server stopped cleanly.");
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

if (require.main === module) {
  startDev().catch((err) => {
    console.error("[Dev] Fatal error:", err);
    process.exit(1);
  });
}

module.exports = { startDev };
