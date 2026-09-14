const { spawn } = require("node:child_process");
const path = require("node:path");
const { loadEnv } = require("./env.js");
const { verifyDatabase } = require("./verify-db.js");
const { ensureServerRunning } = require("./ensure-server.js");
const { checkHealthOnce } = require("./health-check.js");

loadEnv();

const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 5173);

// Parse CLI flags (e.g. --filter=api or --filter=auth)
const filterArg = process.argv.find((a) => a.startsWith("--filter="));
const filterSuite = filterArg ? filterArg.split("=")[1].toLowerCase() : null;

const testSuites = [
  {
    name: "Unit & Static Smoke",
    file: "tests/smoke.test.js",
    category: "unit/smoke"
  },
  {
    name: "PostgreSQL & Supabase Contract",
    file: "tests/postgres.test.js",
    category: "postgres"
  },
  {
    name: "Authoritative API & Pricing",
    file: "tests/api.test.js",
    category: "api"
  },
  {
    name: "Supabase Authentication & Authorization",
    file: "tests/auth.test.js",
    category: "auth"
  },
  {
    name: "Marketplace Payments & Escrow Payouts",
    file: "tests/payment.test.js",
    category: "payment"
  },
  {
    name: "Notifications & Production Hardening",
    file: "tests/notifications.test.js",
    category: "notifications"
  },
  {
    name: "Browser DOM, Lifecycle & Reports",
    file: "tests/browser_smoke.test.js",
    category: "browser"
  },
  {
    name: "Server Routes & Static Asset Smoke",
    file: "tests/server_smoke.js",
    category: "server_smoke"
  }
];


function runSingleTest(suite, targetPort) {
  return new Promise((resolve) => {
    const fullPath = path.join(rootDir, suite.file);
    const start = Date.now();

    const child = spawn(process.execPath, [fullPath], {
      cwd: rootDir,
      env: {
        ...process.env,
        PORT: String(targetPort),
        TARGET_PORT: String(targetPort)
      },
      stdio: "inherit"
    });

    child.on("close", (code) => {
      const duration = ((Date.now() - start) / 1000).toFixed(2);
      resolve({
        suite,
        passed: code === 0,
        exitCode: code,
        duration: `${duration}s`
      });
    });

    child.on("error", (err) => {
      resolve({
        suite,
        passed: false,
        exitCode: -1,
        error: err.message,
        duration: "0s"
      });
    });
  });
}

async function runCompleteTestSuite() {
  console.log("===============================================================");
  console.log("       RentMe Automated Test & Verification Pipeline");
  console.log("===============================================================\n");

  // Step 1: Automatic DB Connectivity & Schema Verification
  console.log("[Pipeline 1/3] Supabase / PostgreSQL Connectivity Check...");
  try {
    await verifyDatabase();
  } catch (dbErr) {
    console.error("[Pipeline] Database verification failed:", dbErr.message);
    process.exit(1);
  }
  console.log("");

  // Step 2: Automatic Health Check & Server Self-Healing / Launch
  console.log(`[Pipeline 2/3] Health-Checking Server on port ${port}...`);
  try {
    await ensureServerRunning({ port });
  } catch (serverErr) {
    console.error("[Pipeline] Failed to ensure server is running:", serverErr.message);
    process.exit(1);
  }
  console.log("");

  // Step 3: Run Test Suites
  const filteredSuites = filterSuite
    ? testSuites.filter(
        (s) =>
          s.category.toLowerCase().includes(filterSuite) ||
          s.name.toLowerCase().includes(filterSuite) ||
          s.file.toLowerCase().includes(filterSuite)
      )
    : testSuites;

  console.log(`[Pipeline 3/3] Running ${filteredSuites.length} Test Suite(s) against http://localhost:${port}...\n`);

  const results = [];
  for (const suite of filteredSuites) {
    console.log(`\n▶ Running [${suite.category}] ${suite.name} (${suite.file})...`);
    const result = await runSingleTest(suite, port);
    results.push(result);

    if (!result.passed) {
      console.error(`\n✖ Test Suite FAILED: [${suite.category}] ${suite.name}`);
      console.error(`  Exit Code: ${result.exitCode}`);
      // Break early on failure to allow inspection & targeted repair
      break;
    }
  }

  // Summary Report
  console.log("\n===============================================================");
  console.log("                    Test Execution Summary");
  console.log("===============================================================");

  let allPassed = true;
  for (const res of results) {
    const icon = res.passed ? "✔ PASS" : "✖ FAIL";
    console.log(`  ${icon.padEnd(8)} [${res.suite.category.padEnd(12)}] ${res.suite.name.padEnd(42)} (${res.duration})`);
    if (!res.passed) allPassed = false;
  }

  // Check if unexecuted suites remained due to early failure
  if (results.length < filteredSuites.length) {
    const unexecuted = filteredSuites.slice(results.length);
    for (const s of unexecuted) {
      console.log(`  - SKIP   [${s.category.padEnd(12)}] ${s.name}`);
    }
    allPassed = false;
  }

  console.log("===============================================================");

  // Verify server is STILL RUNNING on 5173
  const finalHealth = await checkHealthOnce(port, 2000);
  if (finalHealth.ok) {
    console.log(`[Status] RentMe server is ACTIVE and HEALTHY at http://localhost:${port}`);
    console.log("[Status] Ready for local development, browser visits, or subsequent test runs.");
  } else {
    console.warn(`[Status] Warning: Server on port ${port} is not responding after test run. Re-starting...`);
    await ensureServerRunning({ port });
  }

  if (allPassed) {
    console.log("\nAll RentMe verification suites passed successfully!\n");
    process.exit(0);
  } else {
    console.error("\nOne or more test suites failed. Fix the minimal root cause and rerun.\n");
    process.exit(1);
  }
}

if (require.main === module) {
  runCompleteTestSuite().catch((err) => {
    console.error("[TestRunner] Unexpected failure:", err);
    process.exit(1);
  });
}

module.exports = { runCompleteTestSuite, testSuites, runSingleTest };
