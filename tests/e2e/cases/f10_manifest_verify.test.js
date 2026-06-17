const fs = require("fs");
const path = require("path");

describe("F10: Manifest Acceptance Test (verify)", () => {
  const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:3000";
  const oneShotsDir = path.resolve(__dirname, "../../../one-shots");
  const tempDirs = [];

  function rmDirRecursive(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    fs.rmSync(dirPath, { recursive: true, force: true });
  }

  function makeFixture(name, { verifyCmd, mode = "program", attempts = [] } = {}) {
    const tempPath = path.join(oneShotsDir, name);
    rmDirRecursive(tempPath);
    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    const scripts = {};
    if (verifyCmd) scripts.verify = verifyCmd;

    fs.writeFileSync(
      path.join(tempPath, "package.json"),
      JSON.stringify({ name, version: "1.0.0", scripts }, null, 2),
      "utf8",
    );
    fs.writeFileSync(
      path.join(tempPath, "oneshot.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          spec: {
            vision: "v",
            createdAt: new Date().toISOString(),
            acceptance: { mode, script: "verify", successExitCode: 0 },
          },
          attempts,
        },
        null,
        2,
      ),
      "utf8",
    );
    return tempPath;
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      const p = tempDirs.pop();
      rmDirRecursive(p);
    }
  });

  test("F10_1: verify with an exit-0 acceptance test reports passed:true", async () => {
    const name = "temp-f10-pass";
    makeFixture(name, { verifyCmd: 'node -e "process.exit(0)"' });

    const res = await fetch(`${DASHBOARD_URL}/api/manifest/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: name }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.passed).toBe(true);
    expect(data.exitCode).toBe(0);
  });

  test("F10_2: verify with a non-zero acceptance test reports passed:false", async () => {
    const name = "temp-f10-fail";
    makeFixture(name, { verifyCmd: 'node -e "process.exit(3)"' });

    const res = await fetch(`${DASHBOARD_URL}/api/manifest/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: name }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.passed).toBe(false);
    expect(data.exitCode).toBe(3);
  });

  test("F10_3: verify records the result onto a given attempt", async () => {
    const name = "temp-f10-record";
    const attemptId = "att_rec_1";
    makeFixture(name, {
      verifyCmd: 'node -e "process.exit(0)"',
      attempts: [
        {
          id: attemptId,
          timestamp: new Date().toISOString(),
          model: "m",
          environment: { tool: "", toolBuild: "", os: "", osBuild: "" },
          build: { tokens: null, durationMs: null },
          runtime: { tokens: null, durationMs: null },
          evaluation: { method: "none", fidelityScore: null, passed: null, feedback: "", evaluatedAt: null },
        },
      ],
    });

    const res = await fetch(`${DASHBOARD_URL}/api/manifest/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: name, attemptId }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.passed).toBe(true);
    expect(data.recorded).toBe(true);

    const check = await fetch(`${DASHBOARD_URL}/api/scan/${name}/manifest`);
    const checkData = await check.json();
    expect(checkData.attempts[0].evaluation.method).toBe("program");
    expect(checkData.attempts[0].evaluation.passed).toBe(true);
  });

  test("F10_4: verify when acceptance mode is 'human' returns 400", async () => {
    const name = "temp-f10-human";
    makeFixture(name, { verifyCmd: 'node -e "process.exit(0)"', mode: "human" });

    const res = await fetch(`${DASHBOARD_URL}/api/manifest/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: name }),
    });
    expect(res.status).toBe(400);
  });

  test("F10_5: verify with no verify script returns 400", async () => {
    const name = "temp-f10-noscript";
    makeFixture(name, { mode: "program" }); // no verifyCmd → no scripts.verify

    const res = await fetch(`${DASHBOARD_URL}/api/manifest/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: name }),
    });
    expect(res.status).toBe(400);
  });

  test("F10_6: verify protects against path traversal / injection in id", async () => {
    const trav = await fetch(`${DASHBOARD_URL}/api/manifest/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "../../dashboard" }),
    });
    expect(trav.status === 400 || trav.status === 404).toBe(true);

    const inject = await fetch(`${DASHBOARD_URL}/api/manifest/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 'notion-scraper; echo hacked' }),
    });
    expect(inject.status === 400 || inject.status === 404).toBe(true);
  });

  test("F10_7: verify terminates an infinite-loop acceptance test via timeout", async () => {
    const name = "temp-f10-timeout";
    makeFixture(name, { verifyCmd: 'node -e "setInterval(() => {}, 1000)"' });

    const res = await fetch(`${DASHBOARD_URL}/api/manifest/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: name, timeout: 1000 }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.passed).toBe(false);
    expect(data.exitCode).toBeNull();
    expect(data.error && data.error.includes("timeout")).toBe(true);
  });
});
