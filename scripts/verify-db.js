const { Pool } = require("pg");
const { loadEnv, maskDatabaseUrl } = require("./env.js");

loadEnv();

async function verifyDatabase() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    console.log("[Database] DATABASE_URL not set. Running in development in-memory store mode.");
    return { status: "memory", ready: true };
  }

  const isSsl =
    databaseUrl.includes("sslmode=require") ||
    databaseUrl.includes("sslmode=prefer") ||
    databaseUrl.includes("supabase.co") ||
    databaseUrl.includes("pooler.supabase.com") ||
    process.env.PGSSLMODE === "require";

  const cleanConnectionString = databaseUrl
    .replace(/[?&]sslmode=[^&]+/g, "")
    .replace(/[?&]$/, "");

  console.log(`[Database] Verifying connection to ${maskDatabaseUrl(databaseUrl)}...`);

  const pool = new Pool({
    connectionString: cleanConnectionString,
    ssl: isSsl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 8000
  });

  try {
    // 1. Ping connectivity
    const pingRes = await pool.query("SELECT 1 AS connected;");
    if (!pingRes.rows || pingRes.rows[0].connected !== 1) {
      throw new Error("PostgreSQL ping did not return expected response.");
    }
    console.log("[Database] PostgreSQL connection verified successfully.");

    // 2. Check schema readiness
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);
    const tableNames = new Set(tablesRes.rows.map((r) => r.table_name));

    const requiredTables = [
      "users",
      "profiles",
      "companions",
      "experiences",
      "availability",
      "bookings",
      "booking_events",
      "reviews",
      "reports",
      "payments",
      "payouts",
      "notifications",
      "audit_logs"
    ];

    const missingTables = requiredTables.filter((t) => !tableNames.has(t));
    if (missingTables.length > 0) {
      console.log(`[Database] Missing ${missingTables.length} tables: ${missingTables.join(", ")}. Applying schema...`);
      const { applySchema } = require("../dist/db/schemaRunner.js");
      await applySchema(pool);
      console.log("[Database] Schema applied successfully.");
    } else {
      console.log(`[Database] Schema verified: all ${requiredTables.length} production tables present.`);
    }

    // 3. Check data seed readiness (only seed if empty)
    const countRes = await pool.query("SELECT COUNT(*)::int AS count FROM companions;");
    const count = countRes.rows[0]?.count || 0;
    if (count === 0) {
      console.log("[Database] Empty database detected. Auto-seeding Hyderabad demo dataset...");
      const { seedPostgres } = require("../dist/db/seed.js");
      await seedPostgres(pool);
      console.log("[Database] Demo dataset seeded successfully.");
    } else {
      console.log(`[Database] Existing data verified (${count} companions found). No seeding required.`);
    }

    console.log("[Database] Ready for operations.");
    return { status: "postgres", ready: true, companionCount: count };
  } catch (err) {
    console.error("[Database] Connectivity verification failed:", err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  verifyDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { verifyDatabase };
