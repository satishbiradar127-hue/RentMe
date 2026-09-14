const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const requiredFiles = [
  "index.html",
  "server.js",
  "assets/hyderabad-hero.svg",
  "assets/companion-aisha.svg",
  "assets/companion-arjun.svg",
  "assets/companion-meera.svg",
  "src/app.js",
  "src/data.js",
  "src/styles.css"
];

for (const file of requiredFiles) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) {
    throw new Error(`Missing required file: ${file}`);
  }
}

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "src/app.js"), "utf8");
const data = fs.readFileSync(path.join(root, "src/data.js"), "utf8");
const css = fs.readFileSync(path.join(root, "src/styles.css"), "utf8");

const checks = [
  [html.includes('<div id="app"></div>'), "HTML exposes app mount"],
  [html.includes('type="module"'), "HTML loads module script"],
  [app.includes("Estimated total"), "App includes booking estimate calculation"],
  [app.includes("visibleCompanions"), "App includes companion filtering"],
  [app.includes("createBooking"), "App includes booking request flow"],
  [app.includes("setBookingStatus"), "App includes accept and decline flow"],
  [app.includes("localStorage"), "App includes local persistence"],
  [app.includes("Don't Travel Alone."), "App uses locked RentMe hero message"],
  [app.includes("Hyderabad Launch"), "App positions launch city"],
  [app.includes("imageFallback"), "App includes graceful image fallback"],
  [app.includes("validStatuses"), "App guards booking statuses"],
  [app.includes("booking.status !== \"pending\""), "App prevents invalid booking transitions"],
  [app.includes("Report concern") && app.includes("Contact support"), "App includes V1 trust/support entry points"],
  [data.match(/name: "/g)?.length >= 3, "Seed data includes companion profiles"],
  [data.match(/status: "/g)?.length >= 2, "Seed data includes booking states"],
  [data.includes("Hyderabad, Telangana"), "Seed data is Hyderabad-based"],
  [data.includes("Charminar") && data.includes("Golconda Fort") && data.includes("Ramoji Film City"), "Seed data includes Hyderabad travel destinations"],
  [data.includes("assets/companion-aisha.svg"), "Seed data uses reliable local companion assets"],
  [app.includes('currency: "INR"'), "App formats prices in INR"],
  [css.includes("../assets/hyderabad-hero.svg"), "Styles use local hero asset"],
  [css.includes("@media (max-width: 820px)"), "Styles include mobile breakpoint"],
  [css.includes(".listing-card.is-selected"), "Styles include selected listing state"],
  [css.includes(".status-accepted"), "Styles include accepted booking state"],
  [css.includes(".admin-grid"), "Styles include admin visibility"],
  [css.includes(".hero-subtitle"), "Styles include polished hero support copy"]
];

const failures = checks.filter(([passed]) => !passed).map(([, label]) => label);

if (failures.length) {
  throw new Error(`Smoke checks failed:\n- ${failures.join("\n- ")}`);
}

console.log("RentMe smoke checks passed.");
