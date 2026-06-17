const fs = require("fs");
const path = require("path");

describe("F8: Dashboard Actions", () => {
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
    // Create a temporary piece for actions testing
    const pPath = path.join(oneShotsDir, "temp-actions-test");
    rmDirRecursive(pPath);
    fs.mkdirSync(pPath, { recursive: true });
    tempDirs.push(pPath);

    const pkg = {
      name: "temp-actions-test",
      version: "1.0.0",
      description: "Actions test piece",
      tags: ["actions", "test"],
    };
    fs.writeFileSync(
      path.join(pPath, "package.json"),
      JSON.stringify(pkg, null, 2),
      "utf8",
    );
    fs.writeFileSync(
      path.join(pPath, "index.js"),
      'console.log("actions");',
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

  test("F8_1: POST /api/export requires POST method", async () => {
    const res = await fetch(
      `${DASHBOARD_URL}/api/export?id=temp-actions-test`,
      {
        method: "GET",
      },
    );
    expect(res.status).toBe(405);
  });

  test("F8_2: POST /api/export with invalid ID returns 404", async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "invalid-id-for-export" }),
    });
    expect(res.status).toBe(404);
  });

  test("F8_3: POST /api/export with valid ID returns zip archive", async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "temp-actions-test" }),
    });
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type") || "";
    expect(
      contentType.includes("zip") || contentType.includes("octet-stream"),
    ).toBe(true);
  });

  test("F8_4: POST /api/export returns valid ZIP header bytes", async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "temp-actions-test" }),
    });
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer.slice(0, 4));
    // ZIP magic number is 'PK\x03\x04' (0x50, 0x4B, 0x03, 0x04)
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
  });

  test("F8_5: POST /api/polish requires POST method", async () => {
    const res = await fetch(
      `${DASHBOARD_URL}/api/polish?id=temp-actions-test`,
      {
        method: "GET",
      },
    );
    expect(res.status).toBe(405);
  });

  test("F8_6: POST /api/polish with invalid ID returns 404", async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/polish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "invalid-id-for-polish",
        prompt: "optimize imports",
      }),
    });
    expect(res.status).toBe(404);
  });

  test("F8_7: POST /api/polish with valid payload updates metadata/code", async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/polish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "temp-actions-test",
        prompt: "Add keyword to tags",
        updates: {
          tags: ["actions", "test", "polished"],
        },
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify physical file was updated on disk
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(oneShotsDir, "temp-actions-test/package.json"),
        "utf8",
      ),
    );
    expect(pkg.tags.includes("polished")).toBe(true);
  });

  test("F8_8: POST /api/polish payload validation checks", async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/polish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "temp-actions-test" }), // Missing prompt/updates
    });
    expect(res.status).toBe(400);
  });

  test("F8_9: POST /api/suggest with invalid ID returns 404", async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "invalid-id-for-suggest" }),
    });
    expect(res.status).toBe(404);
  });

  test("F8_10: POST /api/suggest returns suggestions structure successfully", async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "temp-actions-test" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.suggestions)).toBe(true);
    if (data.suggestions.length > 0) {
      const first = data.suggestions[0];
      expect(typeof first.type).toBe("string");
      expect(typeof first.description).toBe("string");
      expect(typeof first.codeSnippet).toBe("string");
    }
  });
});
