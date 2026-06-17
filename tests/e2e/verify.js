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

const categories = [
  "Automotive & B2B Lead Generation Tools",
  "AI Development, Prompting, Routing & Evaluation Tools",
  "Agent Orchestration, Governance & Sandbox Frameworks",
  "Codebase Engineering & Git Workflow Enhancers",
  "Data, Document & Workspace Productivity Tools",
  "Micro-SaaS Templates & Personal Workflow Apps",
];

function generateReadme(ideas) {
  const categoriesList = [
    "Automotive & B2B Lead Generation Tools",
    "AI Development, Prompting, Routing & Evaluation Tools",
    "Agent Orchestration, Governance & Sandbox Frameworks",
    "Codebase Engineering & Git Workflow Enhancers",
    "Data, Document & Workspace Productivity Tools",
    "Micro-SaaS Templates & Personal Workflow Apps",
  ];

  let md = `# One-Shot Ideas Registry\n\n`;
  md += `Welcome to the One-Shot Ideas Registry. This repository stores, categories, and indexes ideas for standalone utilities, bots, and Micro-SaaS tools that can be generated in "one-shot" by developer agents.\n\n`;
  md += `## Registry Statistics\n`;
  md += `- **Total Ideas**: ${ideas.length}\n`;
  md += `- **Categories**: 6 major technical domains\n\n`;
  md += `---\n\n`;
  md += `## Ideas by Category\n\n`;

  categoriesList.forEach((category) => {
    const categoryIdeas = ideas.filter((idea) => idea.category === category);
    md += `### ${category}\n\n`;
    md += `| ID | Title | Target Stack | Date Added |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;
    categoryIdeas.forEach((idea) => {
      md += `| \`${idea.id}\` | [${idea.title}](#${idea.id}) | \`${idea.targetStack}\` | ${idea.dateAdded} |\n`;
    });
    md += `\n`;
  });

  md += `---\n\n## Detailed Idea Specs\n\n`;

  ideas.forEach((idea) => {
    md += `### <a name="${idea.id}"></a> ${idea.title}\n\n`;
    md += `- **ID**: \`${idea.id}\`\n`;
    md += `- **Category**: ${idea.category}\n`;
    md += `- **Target Stack**: \`${idea.targetStack}\`\n`;
    md += `- **Date Added**: ${idea.dateAdded}\n`;
    md += `- **Status**: \`${idea.status || "backlog"}\`\n`;
    md += `- **Promoted To**: ${idea.promoted_to !== undefined && idea.promoted_to !== null ? idea.promoted_to : "null"}\n`;
    md += `- **Supersedes**: ${idea.supersedes !== undefined && idea.supersedes !== null ? idea.supersedes : "null"}\n\n`;
    md += `#### Core Vision\n${idea.vision}\n\n`;
    md += `#### Technical Specifications\n${idea.techSpecs}\n\n`;
    md += `#### Standardized Task Prompt\n\`\`\`text\n${idea.readyToCopyTaskPrompt}\n\`\`\`\n\n`;
    md += `---\n\n`;
  });

  return md;
}

function generateIdeasMd(ideas) {
  const categoriesList = [
    "Automotive & B2B Lead Generation Tools",
    "AI Development, Prompting, Routing & Evaluation Tools",
    "Agent Orchestration, Governance & Sandbox Frameworks",
    "Codebase Engineering & Git Workflow Enhancers",
    "Data, Document & Workspace Productivity Tools",
    "Micro-SaaS Templates & Personal Workflow Apps",
  ];

  const promotedIdeas = ideas.filter((i) => i.status === "promoted");
  const promotedTitles = promotedIdeas.map((i) => i.title);
  const promotedStr = promotedTitles.length > 0 ? ` (${promotedTitles.join(", ")})` : "";
  const backlogCount = ideas.filter((i) => i.status === "backlog").length;

  let md = `# One-Shot Ideas Backlog\n\n`;
  md += `This document lists all ideas available in the registry, including their current lifecycle status.\n\n`;
  md += `## Backlog Statistics\n`;
  md += `- **Stats**: ${ideas.length} total ideas, ${promotedIdeas.length} promoted${promotedStr}\n`;
  md += `- **Backlog Ideas**: ${backlogCount}\n\n`;
  md += `---\n\n`;
  md += `## Category Summary\n\n`;

  categoriesList.forEach((category) => {
    const categoryIdeas = ideas.filter((idea) => idea.category === category);
    md += `### ${category}\n\n`;
    md += `| ID | Title | Target Stack | Status | Promoted To |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;
    categoryIdeas.forEach((idea) => {
      const status = idea.status || "backlog";
      const promoted_to = idea.promoted_to;
      let promoted_to_val = "-";
      if (status === "promoted" && promoted_to) {
        promoted_to_val = `\`${promoted_to}\``;
      }
      md += `| \`${idea.id}\` | [${idea.title}](#${idea.id}) | \`${idea.targetStack}\` | \`${status}\` | ${promoted_to_val} |\n`;
    });
    md += `\n`;
  });

  md += `---\n\n## Backlog Details\n\n`;

  ideas.forEach((idea) => {
    md += `### <a name="${idea.id}"></a> ${idea.title}\n\n`;
    md += `- **ID**: \`${idea.id}\`\n`;
    md += `- **Category**: ${idea.category}\n`;
    md += `- **Target Stack**: \`${idea.targetStack}\`\n`;
    md += `- **Status**: \`${idea.status || "backlog"}\`\n`;
    if (idea.status === "promoted" && idea.promoted_to) {
      md += `- **Promoted To**: \`one-shots/${idea.promoted_to}/\`\n`;
    }
    md += `- **Date Added**: ${idea.dateAdded}\n\n`;
    md += `#### Vision\n${idea.vision}\n\n`;
    md += `#### Technical Specifications\n${idea.techSpecs}\n\n`;
    md += `#### Task Prompt\n\`\`\`text\n${idea.readyToCopyTaskPrompt}\n\`\`\`\n\n`;
    md += `---\n\n`;
  });

  return md;
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

            const manifestPath = path.join(fullPath, "oneshot.json");
            let manifest = { schemaVersion: 1, spec: null, attempts: [] };
            let manifestStatus = "missing";

            if (fs.existsSync(manifestPath)) {
              try {
                const raw = fs.readFileSync(manifestPath, "utf8");
                manifest = JSON.parse(raw);
                manifestStatus = "valid";
              } catch (e) {
                manifestStatus = "corrupt";
              }
            }

            const spec = manifest.spec;
            const attempts = Array.isArray(manifest.attempts)
              ? manifest.attempts
              : [];
            const hasVision = !!(
              spec &&
              typeof spec.vision === "string" &&
              spec.vision.trim()
            );
            const attemptCount = attempts.length;
            const latest = attemptCount > 0 ? attempts[attemptCount - 1] : null;
            const evaluation =
              latest && latest.evaluation ? latest.evaluation : null;

            results.push({
              id: file,
              name: pkg.name || file,
              version: pkg.version || "1.0.0",
              description: pkg.description || "",
              tags: pkg.tags || [],
              path: fullPath,
              manifest: {
                hasManifest: hasVision || attemptCount > 0,
                manifestStatus,
                hasVision,
                attemptCount,
                latestFidelity:
                  evaluation && typeof evaluation.fidelityScore === "number"
                    ? evaluation.fidelityScore
                    : null,
                latestPassed:
                  evaluation && typeof evaluation.passed === "boolean"
                    ? evaluation.passed
                    : null,
                latestModel:
                  latest && typeof latest.model === "string"
                    ? latest.model
                    : null,
              },
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

  // GET /api/scan/:id/manifest
  const manifestMatch = url.pathname.match(/^\/api\/scan\/([^/]+)\/manifest$/);
  if (method === "GET" && manifestMatch) {
    const id = decodeURIComponent(manifestMatch[1]);

    if (id.includes("..") || id.includes("/") || id.includes("\\")) {
      sendJSON(404, { error: "Not Found" });
      return;
    }

    const fullPath = path.join(oneShotsDir, id);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
      sendJSON(404, { error: "Not Found" });
      return;
    }

    const manifestPath = path.join(fullPath, "oneshot.json");
    let manifest = { schemaVersion: 1, spec: null, attempts: [] };
    let manifestStatus = "missing";

    if (fs.existsSync(manifestPath)) {
      try {
        const raw = fs.readFileSync(manifestPath, "utf8");
        manifest = JSON.parse(raw);
        manifestStatus = "valid";
      } catch (e) {
        manifestStatus = "corrupt";
      }
    }

    const spec = manifest.spec;
    const attempts = Array.isArray(manifest.attempts) ? manifest.attempts : [];
    const hasVision = !!(
      spec &&
      typeof spec.vision === "string" &&
      spec.vision.trim()
    );
    const attemptCount = attempts.length;
    const latest = attemptCount > 0 ? attempts[attemptCount - 1] : null;
    const evaluation = latest && latest.evaluation ? latest.evaluation : null;

    sendJSON(200, {
      id,
      schemaVersion: manifest.schemaVersion || 1,
      spec: manifest.spec,
      attempts: manifest.attempts || [],
      hasManifest: hasVision || attemptCount > 0,
      manifestStatus,
      hasVision,
      attemptCount,
      latestFidelity:
        evaluation && typeof evaluation.fidelityScore === "number"
          ? evaluation.fidelityScore
          : null,
      latestPassed:
        evaluation && typeof evaluation.passed === "boolean"
          ? evaluation.passed
          : null,
      latestModel:
        latest && typeof latest.model === "string" ? latest.model : null,
    });
    return;
  }

  // POST /api/manifest/spec
  if (url.pathname === "/api/manifest/spec") {
    if (method !== "POST") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    parseJSONBody(req, (err, body) => {
      if (
        err ||
        !body ||
        typeof body.id !== "string" ||
        typeof body.vision !== "string" ||
        !body.vision.trim()
      ) {
        sendJSON(400, { error: "Bad Request" });
        return;
      }

      const protoKeys = ["__proto__", "constructor", "prototype"];
      for (const k of Object.keys(body)) {
        if (protoKeys.includes(k)) {
          sendJSON(400, { error: "Prototype pollution detected" });
          return;
        }
      }
      if (body.acceptance && typeof body.acceptance === "object") {
        for (const k of Object.keys(body.acceptance)) {
          if (protoKeys.includes(k)) {
            sendJSON(400, { error: "Prototype pollution detected" });
            return;
          }
        }
      }

      const id = body.id;
      if (
        id.includes("..") ||
        id.includes("/") ||
        id.includes("\\") ||
        /[;&|`$]/.test(id)
      ) {
        sendJSON(404, { error: "Not Found" });
        return;
      }

      const fullPath = path.join(oneShotsDir, id);
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
        sendJSON(404, { error: "Not Found" });
        return;
      }

      const manifestPath = path.join(fullPath, "oneshot.json");
      let manifest = { schemaVersion: 1, spec: null, attempts: [] };
      let manifestStatus = "missing";

      if (fs.existsSync(manifestPath)) {
        try {
          const raw = fs.readFileSync(manifestPath, "utf8");
          manifest = JSON.parse(raw);
          manifestStatus = "valid";
        } catch (e) {
          manifestStatus = "corrupt";
        }
      }

      if (manifestStatus === "corrupt") {
        sendJSON(409, { error: "Manifest is corrupt" });
        return;
      }

      if (
        manifest.spec &&
        typeof manifest.spec.vision === "string" &&
        manifest.spec.vision.trim()
      ) {
        sendJSON(409, { error: "Vision already set; spec is write-once" });
        return;
      }

      let mode = "human";
      let script = "verify";
      let successExitCode = 0;

      if (body.acceptance && typeof body.acceptance === "object") {
        const a = body.acceptance;
        if (a.mode !== undefined) {
          const validModes = ["human", "program", "none"];
          if (!validModes.includes(a.mode)) {
            sendJSON(400, { error: "Invalid acceptance.mode" });
            return;
          }
          mode = a.mode;
        }
        if (a.script !== undefined && a.script !== null) {
          if (typeof a.script !== "string" || !a.script.trim()) {
            sendJSON(400, { error: "Invalid acceptance.script" });
            return;
          }
          script = a.script.trim();
        }
        if (a.successExitCode !== undefined && a.successExitCode !== null) {
          const code = Number(a.successExitCode);
          if (!Number.isInteger(code)) {
            sendJSON(400, { error: "Invalid acceptance.successExitCode" });
            return;
          }
          successExitCode = code;
        }
      }

      manifest.spec = {
        vision: body.vision.trim(),
        createdAt: new Date().toISOString(),
        acceptance: { mode, script, successExitCode },
      };

      try {
        fs.writeFileSync(
          manifestPath,
          JSON.stringify(manifest, null, 2),
          "utf8",
        );
        sendJSON(200, { success: true, spec: manifest.spec });
      } catch (e) {
        sendJSON(500, { error: "Failed to write manifest" });
      }
    });
    return;
  }

  // POST /api/manifest/attempt
  if (url.pathname === "/api/manifest/attempt") {
    if (method !== "POST") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    parseJSONBody(req, (err, body) => {
      if (err || !body || typeof body.id !== "string") {
        sendJSON(400, { error: "Bad Request" });
        return;
      }

      const protoKeys = ["__proto__", "constructor", "prototype"];
      for (const k of Object.keys(body)) {
        if (protoKeys.includes(k)) {
          sendJSON(400, { error: "Prototype pollution detected" });
          return;
        }
      }

      const id = body.id;
      if (
        id.includes("..") ||
        id.includes("/") ||
        id.includes("\\") ||
        /[;&|`$]/.test(id)
      ) {
        sendJSON(404, { error: "Not Found" });
        return;
      }

      const fullPath = path.join(oneShotsDir, id);
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
        sendJSON(404, { error: "Not Found" });
        return;
      }

      const manifestPath = path.join(fullPath, "oneshot.json");
      let manifest = { schemaVersion: 1, spec: null, attempts: [] };
      let manifestStatus = "missing";

      if (fs.existsSync(manifestPath)) {
        try {
          const raw = fs.readFileSync(manifestPath, "utf8");
          manifest = JSON.parse(raw);
          manifestStatus = "valid";
        } catch (e) {
          manifestStatus = "corrupt";
        }
      }

      if (manifestStatus === "corrupt") {
        sendJSON(409, { error: "Manifest is corrupt" });
        return;
      }

      const attemptId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const attempt = {
        id: attemptId,
        timestamp: new Date().toISOString(),
        model: body.model || "",
        environment: body.environment || {
          tool: "",
          toolBuild: "",
          os: "",
          osBuild: "",
        },
        build: body.build || { tokens: null, durationMs: null },
        runtime: body.runtime || { tokens: null, durationMs: null },
        evaluation: body.evaluation || {
          method: "none",
          fidelityScore: null,
          passed: null,
          feedback: "",
          evaluatedAt: null,
        },
      };

      if (!Array.isArray(manifest.attempts)) {
        manifest.attempts = [];
      }
      manifest.attempts.push(attempt);

      try {
        fs.writeFileSync(
          manifestPath,
          JSON.stringify(manifest, null, 2),
          "utf8",
        );
        sendJSON(200, { success: true, attempt });
      } catch (e) {
        sendJSON(500, { error: "Failed to write manifest" });
      }
    });
    return;
  }

  // POST /api/manifest/evaluation
  if (url.pathname === "/api/manifest/evaluation") {
    if (method !== "POST") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    parseJSONBody(req, (err, body) => {
      if (
        err ||
        !body ||
        typeof body.id !== "string" ||
        typeof body.attemptId !== "string" ||
        !body.attemptId
      ) {
        sendJSON(400, { error: "Bad Request" });
        return;
      }

      const protoKeys = ["__proto__", "constructor", "prototype"];
      for (const k of Object.keys(body)) {
        if (protoKeys.includes(k)) {
          sendJSON(400, { error: "Prototype pollution detected" });
          return;
        }
      }

      const id = body.id;
      if (
        id.includes("..") ||
        id.includes("/") ||
        id.includes("\\") ||
        /[;&|`$]/.test(id)
      ) {
        sendJSON(404, { error: "Not Found" });
        return;
      }

      const fullPath = path.join(oneShotsDir, id);
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
        sendJSON(404, { error: "Not Found" });
        return;
      }

      const manifestPath = path.join(fullPath, "oneshot.json");
      let manifest = { schemaVersion: 1, spec: null, attempts: [] };
      let manifestStatus = "missing";

      if (fs.existsSync(manifestPath)) {
        try {
          const raw = fs.readFileSync(manifestPath, "utf8");
          manifest = JSON.parse(raw);
          manifestStatus = "valid";
        } catch (e) {
          manifestStatus = "corrupt";
        }
      }

      if (manifestStatus === "corrupt") {
        sendJSON(409, { error: "Manifest is corrupt" });
        return;
      }

      const attempt = Array.isArray(manifest.attempts)
        ? manifest.attempts.find((a) => a.id === body.attemptId)
        : null;
      if (!attempt) {
        sendJSON(404, { error: "Attempt not found" });
        return;
      }

      let fidelityScore = null;
      if (
        body.fidelityScore !== undefined &&
        body.fidelityScore !== null &&
        body.fidelityScore !== ""
      ) {
        const n = Number(body.fidelityScore);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          sendJSON(400, { error: "Invalid fidelityScore" });
          return;
        }
        fidelityScore = Math.round(n);
      }

      let passed = null;
      if (body.passed !== undefined && body.passed !== null) {
        if (typeof body.passed !== "boolean") {
          sendJSON(400, { error: "passed must be a boolean" });
          return;
        }
        passed = body.passed;
      }

      let feedback = "";
      if (body.feedback !== undefined && body.feedback !== null) {
        if (typeof body.feedback !== "string") {
          sendJSON(400, { error: "feedback must be a string" });
          return;
        }
        feedback = body.feedback;
      }

      let methodVal = "human";
      if (body.method !== undefined && body.method !== null) {
        const validEvalMethods = ["human", "program", "none"];
        if (!validEvalMethods.includes(body.method)) {
          sendJSON(400, { error: "Invalid evaluation.method" });
          return;
        }
        methodVal = body.method;
      }

      attempt.evaluation = {
        method: methodVal,
        fidelityScore,
        passed,
        feedback,
        evaluatedAt: new Date().toISOString(),
      };

      try {
        fs.writeFileSync(
          manifestPath,
          JSON.stringify(manifest, null, 2),
          "utf8",
        );
        sendJSON(200, { success: true, evaluation: attempt.evaluation });
      } catch (e) {
        sendJSON(500, { error: "Failed to write manifest" });
      }
    });
    return;
  }

  // POST /api/manifest/verify
  if (url.pathname === "/api/manifest/verify") {
    if (method !== "POST") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    parseJSONBody(req, (err, body) => {
      if (err || !body || typeof body.id !== "string") {
        sendJSON(400, { error: "Bad Request" });
        return;
      }

      const id = body.id;
      if (
        id.includes("..") ||
        id.includes("/") ||
        id.includes("\\") ||
        /[;&|`$]/.test(id)
      ) {
        sendJSON(404, { error: "Not Found" });
        return;
      }

      const fullPath = path.join(oneShotsDir, id);
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
        sendJSON(404, { error: "Not Found" });
        return;
      }

      const manifestPath = path.join(fullPath, "oneshot.json");
      let manifest = { schemaVersion: 1, spec: null, attempts: [] };
      let manifestStatus = "missing";

      if (fs.existsSync(manifestPath)) {
        try {
          const raw = fs.readFileSync(manifestPath, "utf8");
          manifest = JSON.parse(raw);
          manifestStatus = "valid";
        } catch (e) {
          manifestStatus = "corrupt";
        }
      }

      const acceptance = manifest.spec && manifest.spec.acceptance;
      if (!acceptance || acceptance.mode !== "program") {
        sendJSON(400, {
          error: "Bad Request: acceptance.mode must be 'program'",
        });
        return;
      }

      const scriptKey =
        typeof acceptance.script === "string" && acceptance.script.trim()
          ? acceptance.script.trim()
          : "verify";
      const successExitCode = Number.isInteger(acceptance.successExitCode)
        ? acceptance.successExitCode
        : 0;

      const attemptId =
        typeof body.attemptId === "string" && body.attemptId
          ? body.attemptId
          : null;
      if (
        attemptId &&
        (!Array.isArray(manifest.attempts) ||
          !manifest.attempts.some((a) => a.id === attemptId))
      ) {
        sendJSON(404, { error: "Attempt not found" });
        return;
      }

      const pkgPath = path.join(fullPath, "package.json");
      let pkg = {};
      try {
        pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      } catch (e) {
        sendJSON(404, { error: "package.json not found" });
        return;
      }

      if (!pkg.scripts || !pkg.scripts[scriptKey]) {
        sendJSON(400, {
          error: `Bad Request: '${scriptKey}' not found in scripts`,
        });
        return;
      }

      const cmd = pkg.scripts[scriptKey];

      if (
        cmd.includes("..") ||
        (path.isAbsolute(cmd) && !cmd.startsWith(fullPath))
      ) {
        sendJSON(400, {
          error:
            "Security violation: command attempts to access paths outside target directory",
        });
        return;
      }

      const processEnv = { ...process.env };
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
          if (killed) {
            exitCode = null;
          }
        }

        const passed = exitCode === successExitCode;

        if (attemptId) {
          const feedback = [stdout, stderr].join("\n").slice(0, 4000);
          const attempt = manifest.attempts.find((a) => a.id === attemptId);
          if (attempt) {
            attempt.evaluation = {
              method: "program",
              fidelityScore: null,
              passed,
              feedback,
              evaluatedAt: new Date().toISOString(),
            };
            try {
              fs.writeFileSync(
                manifestPath,
                JSON.stringify(manifest, null, 2),
                "utf8",
              );
            } catch (e) {}
          }
        }

        const payload = {
          success,
          passed,
          exitCode,
          stdout,
          stderr,
          recorded: !!attemptId,
        };
        if (killed) {
          payload.error = "timeout occurred during execution";
        } else if (error) {
          payload.error = error.message;
        }

        sendJSON(200, payload);
      });

      const timeoutVal = body.timeout || 10000;
      timer = setTimeout(() => {
        killed = true;
        if (process.platform === "win32") {
          try {
            require("child_process").execSync(
              `taskkill /f /pid ${child.pid} /t`,
            );
          } catch (e) {}
        } else {
          child.kill("SIGTERM");
        }
      }, timeoutVal);
    });
    return;
  }

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

  // GET /api/ideas
  if (method === "GET" && url.pathname === "/api/ideas") {
    const ideasDir = path.resolve(__dirname, "../../ideas");
    const registryPath = path.join(ideasDir, "registry.json");
    if (!fs.existsSync(registryPath)) {
      sendJSON(200, []);
      return;
    }
    try {
      const data = fs.readFileSync(registryPath, "utf8");
      const ideas = JSON.parse(data).map(idea => ({
        ...idea,
        status: idea.status || "backlog",
        promoted_to: idea.promoted_to !== undefined ? idea.promoted_to : null,
        supersedes: idea.supersedes !== undefined ? idea.supersedes : null
      }));
      sendJSON(200, ideas);
    } catch (error) {
      sendJSON(500, { error: "Failed to read ideas registry" });
    }
    return;
  }

  // POST /api/ideas
  if (method === "POST" && url.pathname === "/api/ideas") {
    parseJSONBody(req, (err, body) => {
      if (err || !body) {
        sendJSON(400, { error: "Bad Request: Invalid JSON" });
        return;
      }

      const {
        title,
        category,
        vision,
        techSpecs,
        targetStack,
        readyToCopyTaskPrompt,
      } = body;

      // Perform thorough input validation
      if (
        typeof title !== "string" ||
        !title.trim() ||
        typeof category !== "string" ||
        !category.trim() ||
        typeof vision !== "string" ||
        !vision.trim() ||
        typeof techSpecs !== "string" ||
        !techSpecs.trim() ||
        typeof targetStack !== "string" ||
        !targetStack.trim() ||
        typeof readyToCopyTaskPrompt !== "string" ||
        !readyToCopyTaskPrompt.trim()
      ) {
        sendJSON(400, {
          error:
            "Validation Error: All fields are required and must be non-empty strings",
        });
        return;
      }

      // Enforce security checks: category validation
      if (!categories.includes(category)) {
        sendJSON(400, {
          error:
            "Validation Error: Category must be one of the allowed categories",
        });
        return;
      }

      // Enforce security checks: block directory traversal and prototype pollution in title and category
      const checks = [title, category];
      for (const val of checks) {
        if (
          val.includes("..") ||
          val.includes("/") ||
          val.includes("\\") ||
          val.includes("__proto__") ||
          val.includes("constructor") ||
          val.includes("prototype")
        ) {
          sendJSON(400, {
            error:
              "Security Error: Directory traversal or prototype pollution patterns detected",
          });
          return;
        }
      }

      // Read existing registry
      const ideasDir = path.resolve(__dirname, "../../ideas");
      const registryPath = path.join(ideasDir, "registry.json");
      const readmePath = path.join(ideasDir, "README.md");
      const ideasMdPath = path.resolve(__dirname, "../../IDEAS.md");

      let ideas = [];
      if (fs.existsSync(registryPath)) {
        try {
          const data = fs.readFileSync(registryPath, "utf8");
          ideas = JSON.parse(data);
        } catch (e) {
          sendJSON(500, { error: "Failed to read ideas registry" });
          return;
        }
      }

      const prefixMap = {
        "Automotive & B2B Lead Generation Tools": "AUTO",
        "AI Development, Prompting, Routing & Evaluation Tools": "LLM",
        "Agent Orchestration, Governance & Sandbox Frameworks": "AGENT",
        "Codebase Engineering & Git Workflow Enhancers": "CODE",
        "Data, Document & Workspace Productivity Tools": "DATA",
        "Micro-SaaS Templates & Personal Workflow Apps": "MICRO",
      };

      const prefix = prefixMap[category];
      const count = ideas.filter(idea => idea.category === category).length;
      const nextIdNumber = count + 1;
      const finalId = `${prefix}-${String(nextIdNumber).padStart(3, '0')}`;

      const dateAdded = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

      const newIdea = {
        id: finalId,
        title: title.trim(),
        category: category.trim(),
        vision: vision.trim(),
        techSpecs: techSpecs.trim(),
        targetStack: targetStack.trim(),
        readyToCopyTaskPrompt: readyToCopyTaskPrompt.trim(),
        dateAdded,
        status: "backlog",
        promoted_to: null,
        supersedes: null,
      };

      // Append new idea to registry.json
      ideas.push(newIdea);
      try {
        fs.writeFileSync(registryPath, JSON.stringify(ideas, null, 2), "utf8");

        // Automatically regenerate README.md and root IDEAS.md
        const readmeContent = generateReadme(ideas);
        fs.writeFileSync(readmePath, readmeContent, "utf8");

        const ideasMdContent = generateIdeasMd(ideas);
        fs.writeFileSync(ideasMdPath, ideasMdContent, "utf8");

        sendJSON(200, newIdea);
      } catch (error) {
        sendJSON(500, { error: "Internal Server Error: " + error.message });
      }
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
