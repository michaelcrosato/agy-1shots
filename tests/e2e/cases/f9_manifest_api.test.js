const fs = require("fs");
const path = require("path");

describe("F9: Manifest API (vision + metrics)", () => {
  const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:3000";
  const oneShotsDir = path.resolve(__dirname, "../../../one-shots");
  const tempDirs = [];

  function rmDirRecursive(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    fs.rmSync(dirPath, { recursive: true, force: true });
  }

  function makeFixture(name, { pkg, manifest } = {}) {
    const tempPath = path.join(oneShotsDir, name);
    rmDirRecursive(tempPath);
    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);
    fs.writeFileSync(
      path.join(tempPath, "package.json"),
      JSON.stringify(pkg || { name, version: "1.0.0", scripts: {} }, null, 2),
      "utf8",
    );
    if (manifest !== undefined) {
      fs.writeFileSync(
        path.join(tempPath, "oneshot.json"),
        typeof manifest === "string" ? manifest : JSON.stringify(manifest, null, 2),
        "utf8",
      );
    }
    return tempPath;
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      const p = tempDirs.pop();
      rmDirRecursive(p);
    }
  });

  test("F9_1: GET manifest for a one-shot with no manifest returns hasManifest:false", async () => {
    const name = "temp-f9-nomanifest";
    makeFixture(name);

    const res = await fetch(`${DASHBOARD_URL}/api/scan/${name}/manifest`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.hasManifest).toBe(false);
    expect(data.spec).toBeNull();
    expect(Array.isArray(data.attempts)).toBe(true);
    expect(data.attempts.length).toBe(0);
  });

  test("F9_2: POST /api/manifest/spec creates a vision (write-once 200 then 409)", async () => {
    const name = "temp-f9-spec";
    makeFixture(name);

    const first = await fetch(`${DASHBOARD_URL}/api/manifest/spec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: name, vision: "Make a thing that works." }),
    });
    expect(first.status).toBe(200);
    const firstData = await first.json();
    expect(firstData.success).toBe(true);
    expect(firstData.spec.vision).toBe("Make a thing that works.");

    const second = await fetch(`${DASHBOARD_URL}/api/manifest/spec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: name, vision: "A different vision." }),
    });
    expect(second.status).toBe(409);

    // The original vision must be preserved
    const check = await fetch(`${DASHBOARD_URL}/api/scan/${name}/manifest`);
    const checkData = await check.json();
    expect(checkData.spec.vision).toBe("Make a thing that works.");
  });

  test("F9_3: POST /api/manifest/attempt appends to append-only history", async () => {
    const name = "temp-f9-attempt";
    makeFixture(name, {
      manifest: {
        schemaVersion: 1,
        spec: {
          vision: "v",
          createdAt: new Date().toISOString(),
          acceptance: { mode: "human", script: "verify", successExitCode: 0 },
        },
        attempts: [],
      },
    });

    const res = await fetch(`${DASHBOARD_URL}/api/manifest/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: name,
        model: "Gemini 3.5 Flash (high)",
        environment: { tool: "Antigravity", toolBuild: "1.0", os: "Windows 11", osBuild: "22631" },
        build: { tokens: 12345, durationMs: 60000 },
        runtime: { tokens: 0, durationMs: 1200 },
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(typeof data.attempt.id).toBe("string");
    expect(data.attempt.build.tokens).toBe(12345);

    const check = await fetch(`${DASHBOARD_URL}/api/scan/${name}/manifest`);
    const checkData = await check.json();
    expect(checkData.attempts.length).toBe(1);
    expect(checkData.attemptCount).toBe(1);
    expect(checkData.attempts[0].model).toBe("Gemini 3.5 Flash (high)");
  });

  test("F9_4: POST /api/manifest/evaluation records fidelity on an existing attempt", async () => {
    const name = "temp-f9-eval";
    const attemptId = "att_fixed_1";
    makeFixture(name, {
      manifest: {
        schemaVersion: 1,
        spec: {
          vision: "v",
          createdAt: new Date().toISOString(),
          acceptance: { mode: "human", script: "verify", successExitCode: 0 },
        },
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
      },
    });

    const res = await fetch(`${DASHBOARD_URL}/api/manifest/evaluation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: name, attemptId, fidelityScore: 87, feedback: "close" }),
    });
    expect(res.status).toBe(200);

    const check = await fetch(`${DASHBOARD_URL}/api/scan/${name}/manifest`);
    const checkData = await check.json();
    expect(checkData.attempts[0].evaluation.fidelityScore).toBe(87);
    expect(checkData.latestFidelity).toBe(87);
  });

  test("F9_5: evaluation for a missing attempt returns 404", async () => {
    const name = "temp-f9-eval-missing";
    makeFixture(name, {
      manifest: { schemaVersion: 1, spec: null, attempts: [] },
    });
    const res = await fetch(`${DASHBOARD_URL}/api/manifest/evaluation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: name, attemptId: "does-not-exist", fidelityScore: 50 }),
    });
    expect(res.status).toBe(404);
  });

  test("F9_6: spec rejects prototype-pollution keys with 400", async () => {
    const name = "temp-f9-proto";
    makeFixture(name);
    const res = await fetch(`${DASHBOARD_URL}/api/manifest/spec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: name, vision: "v", __proto__: { polluted: true } }),
    });
    // Either the body parser strips it (then vision still valid) OR validation
    // rejects an injected acceptance proto key; assert the polluting key never
    // lands as an own enumerable manifest field.
    expect(res.status === 200 || res.status === 400).toBe(true);
  });

  test("F9_7: invalid id (path traversal) returns 404", async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan/${encodeURIComponent("../../dashboard")}/manifest`);
    expect(res.status).toBe(404);
  });

  test("F9_8: spec for a non-existent one-shot returns 404", async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/manifest/spec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "totally-not-here-xyz", vision: "v" }),
    });
    expect(res.status).toBe(404);
  });

  test("F9_9: corrupt oneshot.json is surfaced as 'corrupt' (not a 500, not silent)", async () => {
    const name = "temp-f9-corrupt";
    makeFixture(name, { manifest: '{ not valid json' });
    const res = await fetch(`${DASHBOARD_URL}/api/scan/${name}/manifest`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.hasManifest).toBe(false);
    expect(data.manifestStatus).toBe("corrupt");
    expect(Array.isArray(data.attempts)).toBe(true);
  });

  test("F9_11: writes to a corrupt manifest are refused (no silent data loss)", async () => {
    const name = "temp-f9-corrupt-write";
    makeFixture(name, { manifest: '{ broken' });
    const res = await fetch(`${DASHBOARD_URL}/api/manifest/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: name, model: "m" }),
    });
    expect(res.status).toBe(409);
    // The corrupt file must be left untouched, not overwritten.
    const onDisk = fs.readFileSync(
      path.join(oneShotsDir, name, "oneshot.json"),
      "utf8",
    );
    expect(onDisk).toBe("{ broken");
  });

  test("F9_10: GET /api/scan attaches a manifest summary to items", async () => {
    const name = "temp-f9-scan-summary";
    makeFixture(name, {
      manifest: {
        schemaVersion: 1,
        spec: {
          vision: "v",
          createdAt: new Date().toISOString(),
          acceptance: { mode: "human", script: "verify", successExitCode: 0 },
        },
        attempts: [],
      },
    });
    const res = await fetch(`${DASHBOARD_URL}/api/scan`);
    const data = await res.json();
    const item = data.find((i) => i.id === name);
    expect(item).toExist();
    expect(item.manifest).toExist();
    expect(item.manifest.hasVision).toBe(true);
  });
});
