const { spawn, execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { checkHealthOnce, waitForHealth } = require("./health-check.js");
const { checkReadinessOnce } = require("./readiness-check.js");
const { loadEnv } = require("./env.js");

loadEnv();

const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 5173);

function findPidOnPort(targetPort) {
  try {
    const output = execSync(`netstat -ano | findstr :${targetPort}`, { encoding: "utf8" });
    const lines = output.trim().split(/\r?\n/);
    for (const line of lines) {
      if (line.includes("LISTENING")) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(Number(pid))) {
          return Number(pid);
        }
      }
    }
  } catch {}
  return null;
}

function killPid(pid) {
  try {
    execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function ensureBuild() {
  const routerPath = path.join(rootDir, "dist", "api", "router.js");
  const schemaPath = path.join(rootDir, "dist", "db", "schema.sql");
  if (!fs.existsSync(routerPath) || !fs.existsSync(schemaPath)) {
    console.log("[Server] Building backend TypeScript artifacts...");
    try {
      execSync("node_modules\\.bin\\tsc.cmd || npx tsc", { cwd: rootDir, stdio: "inherit" });
      const srcSchema = path.join(rootDir, "backend", "db", "schema.sql");
      const destDir = path.join(rootDir, "dist", "db");
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(srcSchema, schemaPath);
      console.log("[Server] Build completed successfully.");
    } catch (err) {
      console.warn("[Server] Build warning:", err.message);
    }
  }
}

async function ensureServerRunning(options = {}) {
  const targetPort = options.port || port;

  // 1. Check if already healthy and running latest build
  const initialCheck = await checkHealthOnce(targetPort, 1500);
  const readinessCheck = initialCheck.ok ? await checkReadinessOnce(targetPort, 1500) : { ok: false };
  if (initialCheck.ok && readinessCheck.ok && !options.forceRestart) {
    console.log(`[Server] RentMe server is already running, up-to-date, and healthy at http://localhost:${targetPort}`);
    return { alreadyRunning: true, port: targetPort };
  }

  // 2. If port is occupied by outdated build or unhealthy process, clean it up
  const pid = findPidOnPort(targetPort);
  if (pid) {
    const reason = !initialCheck.ok ? 'unresponsive' : (!readinessCheck.ok ? 'outdated build' : 'restarting');
    console.log(`[Server] Port ${targetPort} is occupied by process PID ${pid} (${reason}). Recovering...`);
    killPid(pid);
    // Short wait for socket to release
    await new Promise((r) => setTimeout(r, 600));
  }


  // 3. Ensure TypeScript is compiled
  ensureBuild();

  // 4. Start the server
  console.log(`[Server] Starting RentMe server on port ${targetPort}...`);
  const serverPath = path.join(rootDir, "server.js");

  const child = spawn(process.execPath, [serverPath], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(targetPort) },
    detached: !options.foreground,
    stdio: options.foreground ? "inherit" : "ignore"
  });

  if (!options.foreground) {
    child.unref();
  }

  // 5. Wait for health check
  const health = await waitForHealth(targetPort, 12000, 300);
  if (!health.ok) {
    throw new Error(`[Server] Server failed to become healthy on port ${targetPort}: ${health.error}`);
  }

  console.log(`[Server] RentMe server is verified healthy at http://localhost:${targetPort} (boot took ${health.durationMs}ms).`);
  return { alreadyRunning: false, process: child, port: targetPort };
}

if (require.main === module) {
  ensureServerRunning()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = {
  ensureServerRunning,
  findPidOnPort,
  killPid
};
