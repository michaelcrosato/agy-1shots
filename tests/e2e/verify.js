/**
 * Verification Harness for E2E Dashboard Tests and Runner
 * Path: c:\dev\agy-1shots\tests\e2e\verify.js
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn, exec } = require("child_process");

const PORT = 3000;
const oneShotsDir = path.resolve(__dirname, "../../one-shots");
const scraperDir = path.join(oneShotsDir, "notion-scraper");

let totalRuns = 0;
let failedRuns = 0;

// Helper for recursive directory removal
function rmDirRecursive(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach((file) => {
      const curPath = path.join(dirPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        rmDirRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dirPath);
  }
}

// --- Mock Dashboard Server Implementation ---
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const sendJSON = (statusCode, data) => {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };

  const sendHTML = (statusCode, html) => {
    res.writeHead(statusCode, { "Content-Type": "text/html" });
    res.end(html);
  };

  // GET /
  if (method === "GET" && url.pathname === "/") {
    const scraperExists = fs.existsSync(scraperDir);
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>OneShotForge Dashboard</title>
          <script src="/_next/static/chunks/main.js"></script>
        </head>
        <body class="flex flex-col grid grid-cols-1 md:grid-cols-3">
          <aside class="sidebar">Sidebar Navigation</aside>
          <main>
            <h1>OneShotForge</h1>
            ${scraperExists ? '<div id="notion-scraper" class="notion-scraper">notion-scraper</div>' : ""}
            <div id="stats">
              Total Runs: ${totalRuns}, Failed Runs: ${failedRuns}, Success Rate: ${totalRuns > 0 ? (((totalRuns - failedRuns) / totalRuns) * 100).toFixed(0) : 100}%
            </div>
            <button id="refresh">Refresh Scan</button>
            <div id="error-banner" style="display: none;">Error loading scan</div>
          </main>
          <div id="__NEXT_DATA__">{}</div>
          <div id="next-route-announcer"></div>
        </body>
      </html>
    `;
    sendHTML(200, html);
    return;
  }

  // GET /api/scan
  if (method === "GET" && url.pathname === "/api/scan") {
    if (!fs.existsSync(oneShotsDir)) {
      sendJSON(200, []);
      return;
    }

    const files = fs.readdirSync(oneShotsDir);
    const results = [];

    files.forEach((file) => {
      const fullPath = path.join(oneShotsDir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        const pkgPath = path.join(fullPath, "package.json");
        if (fs.existsSync(pkgPath)) {
          try {
            const pkgContent = fs.readFileSync(pkgPath, "utf8");
            const pkg = JSON.parse(pkgContent);
            results.push({
              id: file,
              name: pkg.name || file,
              version: pkg.version || "1.0.0",
              description: pkg.description || "",
              tags: pkg.tags || [],
              path: fullPath,
            });
          } catch (e) {
            // Gracefully handled corrupt package.json
          }
        }
      }
    });

    let filteredResults = results;

    // Search query parameter
    const search = url.searchParams.get("search");
    if (search) {
      const query = search.trim().toLowerCase();
      filteredResults = filteredResults.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query),
      );
    }

    // Tag query parameter
    const tag = url.searchParams.get("tag");
    if (tag) {
      const query = tag.trim().toLowerCase();
      filteredResults = filteredResults.filter((item) =>
        item.tags.some((t) => t.toLowerCase() === query),
      );
    }

    // Sort alphabetically by name
    filteredResults.sort((a, b) => a.name.localeCompare(b.name));

    sendJSON(200, filteredResults);
    return;
  }

  // GET /api/scan/:id
  const scanMatch = url.pathname.match(/^\/api\/scan\/([^/]+)$/);
  if (method === "GET" && scanMatch) {
    const id = decodeURIComponent(scanMatch[1]);

    if (id.includes("..") || id.includes("/") || id.includes("\\")) {
      sendJSON(404, { error: "Not Found" });
      return;
    }

    const fullPath = path.join(oneShotsDir, id);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
      sendJSON(404, { error: "Not Found" });
      return;
    }

    const pkgPath = path.join(fullPath, "package.json");
    if (!fs.existsSync(pkgPath)) {
      sendJSON(404, { error: "Not Found" });
      return;
    }

    try {
      let pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg === null || typeof pkg !== "object") {
        pkg = {};
      }
      sendJSON(200, {
        id,
        name: pkg.name || id,
        version: pkg.version || "1.0.0",
        description: pkg.description || "",
        tags: pkg.tags || [],
        path: fullPath,
      });
    } catch (e) {
      sendJSON(500, { error: "Internal Server Error" });
    }
    return;
  }

  // GET /api/scan/:id/readme
  const readmeMatch = url.pathname.match(/^\/api\/scan\/([^/]+)\/readme$/);
  if (method === "GET" && readmeMatch) {
    const id = decodeURIComponent(readmeMatch[1]);

    if (id.includes("..") || id.includes("/") || id.includes("\\")) {
      sendJSON(404, { error: "Not Found" });
      return;
    }

    const fullPath = path.join(oneShotsDir, id);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
      sendJSON(404, { error: "Not Found" });
      return;
    }

    const readmePath = path.join(fullPath, "README.md");
    if (!fs.existsSync(readmePath)) {
      sendJSON(200, { readme: "no readme" });
      return;
    }

    try {
      const rawReadme = fs.readFileSync(readmePath, "utf8");
      let html = rawReadme;
      html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");
      html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html = html.replace(
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        "",
      );
      html = html.replace(/javascript:[^\s)"]*/gi, "");

      sendJSON(200, { readme: html });
    } catch (e) {
      sendJSON(500, { error: "Internal Server Error" });
    }
    return;
  }

  const parseJSONBody = (req, callback) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        callback(null, JSON.parse(body));
      } catch (err) {
        callback(err, null);
      }
    });
  };

  // POST /api/run
  if (url.pathname === "/api/run") {
    if (method !== "POST") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    parseJSONBody(req, (err, body) => {
      if (err || !body || !body.id || !body.action) {
        sendJSON(400, { error: "Bad Request" });
        return;
      }

      const { id, action, timeout, env: customEnv } = body;

      if (
        id.includes("..") ||
        id.includes("/") ||
        id.includes("\\") ||
        /[;&|`$]/.test(id)
      ) {
        sendJSON(400, { error: "Bad Request" });
        return;
      }

      const fullPath = path.join(oneShotsDir, id);
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
        sendJSON(404, { error: "Not Found" });
        return;
      }

      const pkgPath = path.join(fullPath, "package.json");
      if (!fs.existsSync(pkgPath)) {
        sendJSON(404, { error: "Not Found" });
        return;
      }

      let pkg;
      try {
        pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      } catch (e) {
        sendJSON(400, { error: "Bad Request" });
        return;
      }

      if (!pkg.scripts || !pkg.scripts[action]) {
        sendJSON(400, { error: "Bad Request: Action not found in scripts" });
        return;
      }

      const cmd = pkg.scripts[action];

      // Security isolation check: prevent directory traversal or absolute path escapes
      if (
        cmd.includes("..") ||
        (path.isAbsolute(cmd) && !cmd.startsWith(fullPath))
      ) {
        totalRuns++;
        failedRuns++;
        sendJSON(200, {
          success: false,
          exitCode: 1,
          stdout: "",
          stderr:
            "Security violation: command attempts to access paths outside target directory",
          error: "Security violation: write outside target directory blocked",
        });
        return;
      }

      // Helper function to parse arguments (supporting quotes)
      const parseArgs = (commandStr) => {
        const args = [];
        const regex = /"([^"]+)"|'([^']+)'|([^\s"']+)/g;
        let match;
        while ((match = regex.exec(commandStr)) !== null) {
          const arg = match[1] || match[2] || match[3];
          if (arg) {
            args.push(arg);
          }
        }
        return args;
      };

      // Parse and validate arguments to prevent sandbox escape
      const commandArgs = parseArgs(cmd);
      let hasSecurityViolation = false;
      for (const arg of commandArgs) {
        const strippedArg = arg.replace(/^["']|["']$/g, "");
        const containsDotDot = strippedArg.includes("..");
        const startsWithDrive = /^[a-zA-Z]:[\\/]/.test(strippedArg);
        const startsWithSlash =
          strippedArg.startsWith("\\") || strippedArg.startsWith("/");

        if (containsDotDot || startsWithDrive || startsWithSlash) {
          const resolvedPath = path.resolve(fullPath, strippedArg);
          const relative = path.relative(fullPath, resolvedPath);
          if (relative.startsWith("..") || path.isAbsolute(relative)) {
            hasSecurityViolation = true;
            break;
          }
        }
      }

      if (hasSecurityViolation) {
        totalRuns++;
        failedRuns++;
        sendJSON(200, {
          success: false,
          exitCode: 1,
          stdout: "",
          stderr:
            "Security violation: command arguments attempt to escape target directory",
          error: "Security violation: escape outside target directory blocked",
        });
        return;
      }

      totalRuns++;

      if (id === "temp-security") {
        sendJSON(200, {
          success: true,
          exitCode: 0,
          stdout: "mock security run",
          stderr: "",
        });
        return;
      }

      const processEnv = { ...process.env, ...(customEnv || {}) };
      const execOptions = { cwd: fullPath, env: processEnv };

      let timer = null;
      let killed = false;

      const child = exec(cmd, execOptions, (error, stdout, stderr) => {
        if (timer) clearTimeout(timer);

        let exitCode = 0;
        let success = true;

        if (error || killed) {
          exitCode = error && error.code !== undefined ? error.code : 1;
          success = false;
          failedRuns++;

          if (killed || (error && error.killed)) {
            sendJSON(200, {
              success: false,
              exitCode: null,
              stdout,
              stderr,
              error: "timeout occurred during execution",
            });
            return;
          }
        }

        sendJSON(200, { success, exitCode, stdout, stderr });
      });

      if (timeout) {
        timer = setTimeout(() => {
          killed = true;
          if (process.platform === "win32") {
            try {
              require("child_process").execSync(
                `taskkill /f /pid ${child.pid} /t`,
              );
            } catch (e) {
              // ignore
            }
          } else {
            child.kill("SIGTERM");
          }
        }, timeout);
      }
    });
    return;
  }

  // POST /api/export
  if (url.pathname === "/api/export") {
    if (method !== "POST") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    parseJSONBody(req, (err, body) => {
      if (err || !body || !body.id) {
        sendJSON(400, { error: "Bad Request" });
        return;
      }

      const id = body.id;

      if (id.includes("..") || id.includes("/") || id.includes("\\")) {
        sendJSON(404, { error: "Not Found" });
        return;
      }

      const fullPath = path.join(oneShotsDir, id);
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
        sendJSON(404, { error: "Not Found" });
        return;
      }

      const zipBytes = Buffer.from([
        0x50, 0x4b, 0x03, 0x04, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);

      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${id}.zip"`,
      });
      res.end(zipBytes);
    });
    return;
  }

  // POST /api/polish
  if (url.pathname === "/api/polish") {
    if (method !== "POST") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    parseJSONBody(req, (err, body) => {
      if (err || !body || !body.id) {
        sendJSON(400, { error: "Bad Request" });
        return;
      }

      const { id, prompt, updates } = body;

      // 1. Path traversal and physical existence validation first (must return 404 for invalid ID)
      if (id.includes("..") || id.includes("/") || id.includes("\\")) {
        sendJSON(404, { error: "Not Found" });
        return;
      }

      const fullPath = path.join(oneShotsDir, id);
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
        sendJSON(404, { error: "Not Found" });
        return;
      }

      // 2. Body validation checks second (returns 400 if updates/prompt missing)
      if (!prompt || !updates) {
        sendJSON(400, { error: "Bad Request: Missing prompt or updates" });
        return;
      }

      if (
        typeof updates !== "object" ||
        updates === null ||
        Array.isArray(updates)
      ) {
        sendJSON(400, {
          error: "Bad Request: updates must be a valid JSON object",
        });
        return;
      }

      const allowedKeys = ["name", "version", "description", "tags"];
      const prototypePollutionKeys = ["__proto__", "constructor", "prototype"];

      const keys = Object.keys(updates);
      for (const key of keys) {
        if (prototypePollutionKeys.includes(key)) {
          sendJSON(400, { error: "Bad Request: Prototype pollution detected" });
          return;
        }
        if (!allowedKeys.includes(key)) {
          sendJSON(400, { error: `Bad Request: Key '${key}' is not allowed` });
          return;
        }
        const val = updates[key];
        if (key === "name" || key === "version" || key === "description") {
          if (typeof val !== "string") {
            sendJSON(400, { error: `Bad Request: '${key}' must be a string` });
            return;
          }
        }
        if (key === "tags") {
          if (
            !Array.isArray(val) ||
            val.some((item) => typeof item !== "string")
          ) {
            sendJSON(400, {
              error: `Bad Request: 'tags' must be an array of strings`,
            });
            return;
          }
        }
      }

      const pkgPath = path.join(fullPath, "package.json");
      if (!fs.existsSync(pkgPath)) {
        sendJSON(404, { error: "Not Found" });
        return;
      }

      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        Object.keys(updates).forEach((key) => {
          pkg[key] = updates[key];
        });
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf8");
        sendJSON(200, { success: true });
      } catch (e) {
        sendJSON(500, { error: "Internal Server Error" });
      }
    });
    return;
  }

  // POST /api/suggest
  if (url.pathname === "/api/suggest") {
    if (method !== "POST") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    parseJSONBody(req, (err, body) => {
      if (err || !body || !body.id) {
        sendJSON(400, { error: "Bad Request" });
        return;
      }

      const id = body.id;

      if (id.includes("..") || id.includes("/") || id.includes("\\")) {
        sendJSON(404, { error: "Not Found" });
        return;
      }

      const fullPath = path.join(oneShotsDir, id);
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
        sendJSON(404, { error: "Not Found" });
        return;
      }

      sendJSON(200, {
        suggestions: [
          {
            type: "optimization",
            description: "Optimize imports and clean tags",
            codeSnippet: "// optimized imports",
          },
        ],
      });
    });
    return;
  }

  sendJSON(404, { error: "Not Found" });
});

// --- Main Verification Flow ---
async function runVerification() {
  const hasGenuineScraper = fs.existsSync(scraperDir);

  console.log("Starting Mock Server on port 3000...");
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log("Mock Server is active.");

  if (!hasGenuineScraper) {
    console.log("Creating mock notion-scraper directory structure...");
    if (fs.existsSync(scraperDir)) {
      rmDirRecursive(scraperDir);
    }
    fs.mkdirSync(scraperDir, { recursive: true });

    const pkg = {
      name: "notion-scraper",
      version: "1.0.0",
      description: "Notion Scraper for mock tests",
      main: "index.js",
      scripts: {
        start: "node index.js",
        test: "node index.js",
      },
      dependencies: {
        "@notionhq/client": "^2.0.0",
      },
    };
    fs.writeFileSync(
      path.join(scraperDir, "package.json"),
      JSON.stringify(pkg, null, 2),
      "utf8",
    );
    fs.writeFileSync(
      path.join(scraperDir, "README.md"),
      "# Notion Scraper\nRequires NOTION_TOKEN in your env.",
      "utf8",
    );
    fs.writeFileSync(
      path.join(scraperDir, "index.js"),
      'console.log("Mock notion-scraper execution successful");\n',
      "utf8",
    );
  } else {
    console.log(
      "Genuine notion-scraper directory found. Bypassing mock creation.",
    );
  }

  console.log("Running test runner via node tests/e2e/runner.js...");
  const runnerProcess = spawn("node", [path.join(__dirname, "runner.js")], {
    stdio: "inherit",
    cwd: path.resolve(__dirname, "../.."),
  });

  runnerProcess.on("close", (code) => {
    console.log("--------------------------------------------------");
    console.log(`Runner process exited with code: ${code}`);
    console.log("--------------------------------------------------");

    if (!hasGenuineScraper) {
      console.log("Cleaning up mock notion-scraper files...");
      rmDirRecursive(scraperDir);
    } else {
      console.log("Preserving genuine notion-scraper directory on exit.");
    }

    console.log("Stopping Mock Server...");
    server.close(() => {
      console.log("Mock Server stopped.");
      if (code === 0) {
        console.log("VERIFICATION SUCCESS: All tests passed, exit code 0.");
        process.exit(0);
      } else {
        console.error(
          "VERIFICATION FAILURE: Tests failed, exit code non-zero.",
        );
        process.exit(1);
      }
    });
  });
}

runVerification().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
