const fs = require("fs");
const path = require("path");

describe("F4: Dashboard API Run", () => {
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

  afterEach(() => {
    while (tempDirs.length > 0) {
      const p = tempDirs.pop();
      if (fs.existsSync(p)) {
        rmDirRecursive(p);
      }
    }
  });

  test("F4_1: POST /api/run requires POST method", async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: "GET",
    });
    expect(res.status).toBe(405);
  });

  test("F4_2: POST /api/run with missing payload returns 400 Bad Request", async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("F4_3: POST /api/run with non-existent script ID returns 404 Not Found", async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "fake-script-id", action: "test" }),
    });
    expect(res.status).toBe(404);
  });

  test("F4_4: POST /api/run with invalid action returns 400 Bad Request", async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "notion-scraper", action: "invalid-action" }),
    });
    expect(res.status).toBe(400);
  });

  test("F4_5: POST /api/run runs simple command and returns success", async () => {
    const tempDirName = "temp-run-success";
    const tempPath = path.join(oneShotsDir, tempDirName);
    rmDirRecursive(tempPath);

    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    const pkg = {
      name: tempDirName,
      version: "1.0.0",
      description: "Temp run success test",
      scripts: {
        test: "node -e \"console.log('RUN_SUCCESS_OUTPUT')\"",
      },
    };
    fs.writeFileSync(
      path.join(tempPath, "package.json"),
      JSON.stringify(pkg, null, 2),
      "utf8",
    );

    const res = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tempDirName, action: "test" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.exitCode).toBe(0);
    expect(data.stdout.includes("RUN_SUCCESS_OUTPUT")).toBe(true);

    rmDirRecursive(tempPath);
    tempDirs.splice(tempDirs.indexOf(tempPath), 1);
  });

  test("F4_6: POST /api/run execution returns output, success, and exit code details", async () => {
    const tempDirName = "temp-run-details";
    const tempPath = path.join(oneShotsDir, tempDirName);
    rmDirRecursive(tempPath);

    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    const pkg = {
      name: tempDirName,
      version: "1.0.0",
      description: "Temp run details test",
      scripts: {
        start:
          "node -e \"console.log('Stdout details'); console.error('Stderr details');\"",
      },
    };
    fs.writeFileSync(
      path.join(tempPath, "package.json"),
      JSON.stringify(pkg, null, 2),
      "utf8",
    );

    const res = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tempDirName, action: "start" }),
    });
    const data = await res.json();
    expect(typeof data.success).toBe("boolean");
    expect(typeof data.exitCode).toBe("number");
    expect(typeof data.stdout).toBe("string");
    expect(typeof data.stderr).toBe("string");
    expect(data.stdout.includes("Stdout details")).toBe(true);
    expect(data.stderr.includes("Stderr details")).toBe(true);

    rmDirRecursive(tempPath);
    tempDirs.splice(tempDirs.indexOf(tempPath), 1);
  });

  test("F4_7: POST /api/run handles execution failure (exits non-zero)", async () => {
    const tempDirName = "temp-run-fail";
    const tempPath = path.join(oneShotsDir, tempDirName);
    rmDirRecursive(tempPath);

    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    const pkg = {
      name: tempDirName,
      version: "1.0.0",
      description: "Temp run fail test",
      scripts: {
        test: 'node -e "process.exit(5)"',
      },
    };
    fs.writeFileSync(
      path.join(tempPath, "package.json"),
      JSON.stringify(pkg, null, 2),
      "utf8",
    );

    const res = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tempDirName, action: "test" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.exitCode).toBe(5);

    rmDirRecursive(tempPath);
    tempDirs.splice(tempDirs.indexOf(tempPath), 1);
  });

  test("F4_8: POST /api/run terminates infinite loop scripts via timeout", async () => {
    const tempDirName = "temp-run-timeout";
    const tempPath = path.join(oneShotsDir, tempDirName);
    rmDirRecursive(tempPath);

    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    const pkg = {
      name: tempDirName,
      version: "1.0.0",
      description: "Temp run timeout test",
      scripts: {
        test: 'node -e "setInterval(() => {}, 1000)"',
      },
    };
    fs.writeFileSync(
      path.join(tempPath, "package.json"),
      JSON.stringify(pkg, null, 2),
      "utf8",
    );

    const res = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tempDirName, action: "test", timeout: 1000 }), // Ask dashboard to timeout after 1s
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.exitCode).toBeNull(); // Or whatever is returned on signal termination
    expect(data.error && data.error.includes("timeout")).toBe(true);

    rmDirRecursive(tempPath);
    tempDirs.splice(tempDirs.indexOf(tempPath), 1);
  });

  test("F4_9: POST /api/run protects against shell injection in script ID", async () => {
    const maliciousId = 'notion-scraper; echo "hacked"';
    const res = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: maliciousId, action: "test" }),
    });
    // Should be rejected with 400 or 404, not crash or run the injected command
    expect(res.status === 400 || res.status === 404).toBe(true);
  });

  test("F4_10: POST /api/run protects against path traversal in script ID", async () => {
    const maliciousId = "../../dashboard";
    const res = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: maliciousId, action: "test" }),
    });
    // Should reject with bad request or not found
    expect(res.status === 400 || res.status === 404).toBe(true);
  });
});
