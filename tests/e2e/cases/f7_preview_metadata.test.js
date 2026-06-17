const fs = require("fs");
const path = require("path");

describe("F7: Dashboard Preview/Metadata", () => {
  const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:3000";
  const oneShotsDir = path.resolve(__dirname, "../../../one-shots");
  const tempDirs = [];

  function rmDirRecursive(dirPath) {
    if (fs.existsSync(dirPath)) {
      fs.readdirSync(dirPath).forEach((file) => {
        const curPath = path.join(dirPath, file);
        if (fs.lstatSync(curPath).isDirectory()) {
          rmDirRecursive(curPath);
        } else {
          let retries = 30;
          while (retries > 0) {
            try {
              fs.unlinkSync(curPath);
              break;
            } catch (err) {
              if (
                retries > 1 &&
                (err.code === "EBUSY" ||
                  err.code === "ENOTEMPTY" ||
                  err.code === "EPERM")
              ) {
                retries--;
                const end = Date.now() + 100;
                while (Date.now() < end) {}
              } else {
                throw err;
              }
            }
          }
        }
      });
      let retries = 30;
      while (retries > 0) {
        try {
          fs.rmdirSync(dirPath);
          break;
        } catch (err) {
          if (err.code === "ENOENT") {
            break; // Already deleted
          }
          if (
            retries > 1 &&
            (err.code === "EBUSY" ||
              err.code === "ENOTEMPTY" ||
              err.code === "EPERM")
          ) {
            retries--;
            const end = Date.now() + 100;
            while (Date.now() < end) {}
          } else {
            throw err;
          }
        }
      }
    }
  }

  beforeAll(() => {
    // Create a temporary piece with standard README
    const pPath = path.join(oneShotsDir, "temp-preview-standard");
    rmDirRecursive(pPath);
    fs.mkdirSync(pPath, { recursive: true });
    tempDirs.push(pPath);

    const pkg = {
      name: "temp-preview-standard",
      version: "1.2.3",
      description: "Preview standard test piece",
      tags: ["preview", "standard"],
    };
    fs.writeFileSync(
      path.join(pPath, "package.json"),
      JSON.stringify(pkg, null, 2),
      "utf8",
    );
    fs.writeFileSync(
      path.join(pPath, "README.md"),
      "# Standard Title\nThis is **bold** text.",
      "utf8",
    );

    // Create a temporary piece with malicious script tags for XSS checks
    const xssPath = path.join(oneShotsDir, "temp-preview-xss");
    rmDirRecursive(xssPath);
    fs.mkdirSync(xssPath, { recursive: true });
    tempDirs.push(xssPath);

    const xssPkg = {
      name: "temp-preview-xss",
      version: "1.0.0",
      description: "Preview XSS test piece",
      tags: ["preview", "xss"],
    };
    fs.writeFileSync(
      path.join(xssPath, "package.json"),
      JSON.stringify(xssPkg, null, 2),
      "utf8",
    );
    fs.writeFileSync(
      path.join(xssPath, "README.md"),
      '# XSS Title\n<script>alert("hacked")</script>\n[click](javascript:alert(1))',
      "utf8",
    );

    // Create a temporary piece with missing README
    const missingPath = path.join(oneShotsDir, "temp-preview-missing-readme");
    rmDirRecursive(missingPath);
    fs.mkdirSync(missingPath, { recursive: true });
    tempDirs.push(missingPath);

    const missingPkg = {
      name: "temp-preview-missing-readme",
      version: "1.0.0",
      description: "Preview missing readme test piece",
      tags: ["preview", "missing"],
    };
    fs.writeFileSync(
      path.join(missingPath, "package.json"),
      JSON.stringify(missingPkg, null, 2),
      "utf8",
    );
  });

  afterAll(() => {
    while (tempDirs.length > 0) {
      const p = tempDirs.pop();
      if (fs.existsSync(p)) {
        rmDirRecursive(p);
      }
    }
  });

  test("F7_1: GET /api/scan/temp-preview-standard returns metadata successfully", async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan/temp-preview-standard`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("temp-preview-standard");
    expect(data.version).toBe("1.2.3");
  });

  test("F7_2: GET /api/scan/temp-preview-standard/readme returns README content", async () => {
    const res = await fetch(
      `${DASHBOARD_URL}/api/scan/temp-preview-standard/readme`,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.readme).toBe("string");
  });

  test("F7_3: GET /api/scan/nonexistent-id returns 404", async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan/nonexistent-id`);
    expect(res.status).toBe(404);
  });

  test("F7_4: GET /api/scan/nonexistent-id/readme returns 404", async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan/nonexistent-id/readme`);
    expect(res.status).toBe(404);
  });

  test("F7_5: GET /api/scan/temp-preview-missing-readme/readme handles missing README file gracefully", async () => {
    const res = await fetch(
      `${DASHBOARD_URL}/api/scan/temp-preview-missing-readme/readme`,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.readme).toExist();
    expect(
      data.readme.toLowerCase().includes("no readme") || data.readme === "",
    ).toBe(true);
  });

  test("F7_6: GET /api/scan/temp-preview-xss/readme sanitizes XSS in markdown rendering", async () => {
    const res = await fetch(
      `${DASHBOARD_URL}/api/scan/temp-preview-xss/readme`,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    const cleanReadme = data.readme;
    // Check that script tag is either stripped, escaped, or not rendered as raw html script
    const hasRawScript =
      cleanReadme.includes("<script>") ||
      cleanReadme.includes("javascript:alert");
    expect(hasRawScript).toBe(false);
  });

  test("F7_7: GET /api/scan/../dashboard prevents path traversal for metadata", async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan/..%2Fdashboard`);
    expect(res.status === 400 || res.status === 404).toBe(true);
  });

  test("F7_8: GET /api/scan/../dashboard/readme prevents path traversal for readme", async () => {
    const res = await fetch(
      `${DASHBOARD_URL}/api/scan/..%2Fdashboard%2Freadme`,
    );
    expect(res.status === 400 || res.status === 404).toBe(true);
  });

  test("F7_9: GET /api/scan/temp-preview-standard metadata includes tags and path details", async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan/temp-preview-standard`);
    const data = await res.json();
    expect(Array.isArray(data.tags)).toBe(true);
    expect(data.tags.includes("standard")).toBe(true);
    expect(typeof data.path).toBe("string");
  });

  test("F7_10: GET /api/scan/temp-preview-standard/readme parses Markdown into HTML", async () => {
    const res = await fetch(
      `${DASHBOARD_URL}/api/scan/temp-preview-standard/readme`,
    );
    const data = await res.json();
    const html = data.readme;
    expect(html.includes("<h1>") || html.includes("<h1 ")).toBe(true);
    expect(html.includes("<strong>") || html.includes("<b>")).toBe(true);
  });
});
