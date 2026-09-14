const fs = require("node:fs");
const path = require("node:path");

let loaded = false;

function loadEnv() {
  if (loaded) return;
  const envPath = path.resolve(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    if (typeof process.loadEnvFile === "function") {
      try {
        process.loadEnvFile(envPath);
        loaded = true;
      } catch (err) {
        parseEnvFile(envPath);
      }
    } else {
      parseEnvFile(envPath);
    }
  }
}

function parseEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
    loaded = true;
  } catch {}
}

function maskDatabaseUrl(url) {
  if (!url) return "<not configured>";
  try {
    const clean = url.replace(/^postgresql:\/\//i, "http://");
    const parsed = new URL(clean);
    const host = parsed.hostname;
    const port = parsed.port ? `:${parsed.port}` : "";
    const db = parsed.pathname;
    return `postgresql://***:***@${host}${port}${db}`;
  } catch {
    return "postgresql://***:***@<configured>";
  }
}

function maskSecret(val) {
  if (!val) return "<empty>";
  if (val.length <= 8) return "***";
  return `${val.slice(0, 4)}...***...${val.slice(-4)}`;
}

loadEnv();

module.exports = {
  loadEnv,
  maskDatabaseUrl,
  maskSecret
};
