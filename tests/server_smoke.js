const http = require("node:http");
process.env.PORT = "5199";
const { server } = require("../server.js");

setTimeout(async () => {
  try {
    const targetPort = Number(process.env.TARGET_PORT || 5199);
    const fetch = (path) => new Promise((resolve, reject) => {
      http.get(`http://localhost:${targetPort}${path}`, (res) => {
        let data = "";
        res.on("data", (chunk) => data += chunk);
        res.on("end", () => resolve({ status: res.statusCode, data, type: res.headers["content-type"] }));
      }).on("error", reject);
    });

    const htmlRes = await fetch("/");
    if (htmlRes.status !== 200 || !htmlRes.data.includes('<div id="app"></div>')) {
      throw new Error(`Failed to serve root HTML properly: status ${htmlRes.status}`);
    }
    console.log("✔ Root HTML served correctly with app mount");

    const cssRes = await fetch("/src/styles.css");
    if (cssRes.status !== 200 || !cssRes.data.includes(".topbar")) {
      throw new Error(`Failed to serve styles.css: status ${cssRes.status}`);
    }
    console.log("✔ Stylesheet served correctly");

    const apiRes = await fetch("/api/companions");
    if (apiRes.status !== 200 || !apiRes.data.includes("Aisha Khan")) {
      throw new Error(`Failed to serve API route: status ${apiRes.status}`);
    }
    console.log("✔ API endpoint /api/companions served correctly");

    const bookingRes = await fetch("/api/bookings");
    if (bookingRes.status !== 200 || !bookingRes.data.includes("Rohan Mehta")) {
      throw new Error(`Failed to serve API route: status ${bookingRes.status}`);
    }
    console.log("✔ API endpoint /api/bookings served correctly");

    if (!process.env.TARGET_PORT && server.listening) {
      server.close(() => {
        console.log("All local server smoke checks passed!");
        process.exit(0);
      });
    } else {
      console.log("All local server smoke checks passed!");
      process.exit(0);
    }
  } catch (err) {
    console.error("Server smoke check failure:", err);
    process.exit(1);
  }
}, 300);
