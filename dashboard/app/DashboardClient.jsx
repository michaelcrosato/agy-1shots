"use client";

import React, { useState, useEffect } from "react";

// --- Small presentational helpers (shared across modals) ---

function fidelityColor(score) {
  if (typeof score !== "number") return "text-slate-400";
  if (score >= 80) return "text-green-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function fmtMs(ms) {
  if (typeof ms !== "number" || !isFinite(ms)) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

function fmtNum(n) {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  return n.toLocaleString();
}

// Finished-execution console block, reused by the Run modal and acceptance test.
function RunResult({ output }) {
  if (!output) return null;
  return (
    <div className="space-y-2">
      <div className={output.success ? "text-green-400" : "text-red-400"}>
        &gt; Execution finished with exit code:{" "}
        {output.exitCode !== null ? output.exitCode : "Killed/Timeout"}
      </div>

      {output.error && (
        <div className="text-red-500 font-bold">[ERROR]: {output.error}</div>
      )}

      {output.stdout && (
        <div>
          <div className="text-slate-400 border-b border-slate-800 pb-1 mb-1 font-semibold">
            stdout:
          </div>
          <pre className="whitespace-pre-wrap text-slate-300">
            {output.stdout}
          </pre>
        </div>
      )}

      {output.stderr && (
        <div>
          <div className="text-red-400 border-b border-slate-800 pb-1 mb-1 font-semibold">
            stderr:
          </div>
          <pre className="whitespace-pre-wrap text-red-300">
            {output.stderr}
          </pre>
        </div>
      )}
    </div>
  );
}

// Zero-dependency trend line (no charting library, matching the project ethos).
function Sparkline({ values, stroke = "#60a5fa", width = 160, height = 32 }) {
  const valid = values.filter((v) => typeof v === "number" && isFinite(v));
  if (valid.length < 2) {
    return <span className="text-slate-600 text-xs">not enough data</span>;
  }
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const denom = values.length > 1 ? values.length - 1 : 1;
  const pts = [];
  values.forEach((v, i) => {
    if (typeof v !== "number" || !isFinite(v)) return;
    const x = (i / denom) * width;
    const y = height - ((v - min) / range) * height;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  return (
    <svg width={width} height={height} className="block">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
      />
    </svg>
  );
}

// --- Forms ---

function SetVisionForm({ id, onCreated }) {
  const [vision, setVision] = useState("");
  const [mode, setMode] = useState("human");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!vision.trim()) {
      setError("Vision text is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/manifest/spec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, vision, acceptance: { mode } }),
      });
      const data = await res.json();
      if (res.ok) {
        onCreated();
      } else {
        setError(data.error || "Failed to save vision.");
      }
    } catch (e) {
      setError("Network error saving vision.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-blue-900/60 rounded-lg p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-blue-300">
          Set the Vision (write-once)
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Describe what success looks like. Once saved this is permanent and
          never deleted — it is the benchmark every future attempt is measured
          against.
        </p>
      </div>
      <textarea
        value={vision}
        onChange={(e) => setVision(e.target.value)}
        rows={4}
        placeholder="The expected outcome of this one-shot…"
        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
      />
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs text-slate-400">Evaluation mode:</label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100"
        >
          <option value="human">human (feedback score)</option>
          <option value="program">program (runnable test)</option>
        </select>
        <button
          onClick={submit}
          disabled={saving}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white text-sm font-medium rounded transition-colors"
        >
          {saving ? "Saving…" : "Save Vision"}
        </button>
      </div>
      {error && <div className="text-xs text-red-400">{error}</div>}
    </div>
  );
}

function RecordAttemptForm({ id, onAdded }) {
  const [model, setModel] = useState("");
  const [tool, setTool] = useState("");
  const [toolBuild, setToolBuild] = useState("");
  const [os, setOs] = useState("");
  const [osBuild, setOsBuild] = useState("");
  const [buildTokens, setBuildTokens] = useState("");
  const [buildMs, setBuildMs] = useState("");
  const [runtimeTokens, setRuntimeTokens] = useState("");
  const [runtimeMs, setRuntimeMs] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toNum = (v) => (v === "" ? null : Number(v));

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/manifest/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          model,
          environment: { tool, toolBuild, os, osBuild },
          build: { tokens: toNum(buildTokens), durationMs: toNum(buildMs) },
          runtime: {
            tokens: toNum(runtimeTokens),
            durationMs: toNum(runtimeMs),
          },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setModel("");
        setTool("");
        setToolBuild("");
        setOs("");
        setOsBuild("");
        setBuildTokens("");
        setBuildMs("");
        setRuntimeTokens("");
        setRuntimeMs("");
        onAdded();
      } else {
        setError(data.error || "Failed to record attempt.");
      }
    } catch (e) {
      setError("Network error recording attempt.");
    } finally {
      setSaving(false);
    }
  };

  const input =
    "px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500";

  return (
    <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-200">
        Record a build attempt
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          className={input}
          placeholder="Model (e.g. Gemini 3.5 Flash (high))"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
        <input
          className={input}
          placeholder="Tool (e.g. Antigravity)"
          value={tool}
          onChange={(e) => setTool(e.target.value)}
        />
        <input
          className={input}
          placeholder="Tool build (e.g. 1.2.3456)"
          value={toolBuild}
          onChange={(e) => setToolBuild(e.target.value)}
        />
        <input
          className={input}
          placeholder="OS (e.g. Windows 11)"
          value={os}
          onChange={(e) => setOs(e.target.value)}
        />
        <input
          className={input}
          placeholder="OS build (e.g. 22631)"
          value={osBuild}
          onChange={(e) => setOsBuild(e.target.value)}
        />
        <div />
        <input
          className={input}
          type="number"
          min="0"
          placeholder="Build tokens"
          value={buildTokens}
          onChange={(e) => setBuildTokens(e.target.value)}
        />
        <input
          className={input}
          type="number"
          min="0"
          placeholder="Build time (ms)"
          value={buildMs}
          onChange={(e) => setBuildMs(e.target.value)}
        />
        <input
          className={input}
          type="number"
          min="0"
          placeholder="Runtime tokens"
          value={runtimeTokens}
          onChange={(e) => setRuntimeTokens(e.target.value)}
        />
        <input
          className={input}
          type="number"
          min="0"
          placeholder="Runtime (ms)"
          value={runtimeMs}
          onChange={(e) => setRuntimeMs(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={saving}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white text-sm font-medium rounded transition-colors"
        >
          {saving ? "Saving…" : "Add Attempt"}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  );
}

function AttemptRow({ id, attempt, acceptanceMode, onChanged }) {
  const ev = attempt.evaluation || {};
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(
    typeof ev.fidelityScore === "number" ? String(ev.fidelityScore) : "",
  );
  const [feedback, setFeedback] = useState(
    typeof ev.feedback === "string" ? ev.feedback : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyOut, setVerifyOut] = useState(null);

  const env = attempt.environment || {};
  const build = attempt.build || {};
  const runtime = attempt.runtime || {};

  const saveEval = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/manifest/evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          attemptId: attempt.id,
          method: "human",
          fidelityScore: score === "" ? null : Number(score),
          feedback,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onChanged();
      } else {
        setError(data.error || "Failed to save evaluation.");
      }
    } catch (e) {
      setError("Network error saving evaluation.");
    } finally {
      setSaving(false);
    }
  };

  const runVerify = async () => {
    setVerifying(true);
    setVerifyOut(null);
    setError("");
    try {
      const res = await fetch("/api/manifest/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, attemptId: attempt.id }),
      });
      const data = await res.json();
      setVerifyOut(data);
      if (res.ok) {
        onChanged();
      } else {
        setError(data.error || "Acceptance test could not run.");
      }
    } catch (e) {
      setError("Network error running acceptance test.");
    } finally {
      setVerifying(false);
    }
  };

  const renderFidelity = () => {
    if (ev.method === "program" && typeof ev.passed === "boolean") {
      return (
        <span className={ev.passed ? "text-green-400" : "text-red-400"}>
          {ev.passed ? "✓ pass" : "✗ fail"}
        </span>
      );
    }
    if (typeof ev.fidelityScore === "number") {
      return (
        <span className={fidelityColor(ev.fidelityScore)}>
          {ev.fidelityScore}%
        </span>
      );
    }
    return <span className="text-slate-600">—</span>;
  };

  const envLabel =
    [env.tool, env.toolBuild].filter(Boolean).join(" ") +
    (env.os || env.osBuild
      ? ` / ${[env.os, env.osBuild].filter(Boolean).join(" ")}`
      : "");

  return (
    <>
      <tr className="border-t border-slate-800">
        <td className="py-2 pr-3 text-slate-400 whitespace-nowrap">
          {attempt.timestamp
            ? new Date(attempt.timestamp).toLocaleString()
            : "—"}
        </td>
        <td className="py-2 pr-3 text-slate-200">{attempt.model || "—"}</td>
        <td className="py-2 pr-3 text-slate-400">{envLabel || "—"}</td>
        <td className="py-2 pr-3 text-slate-300 whitespace-nowrap">
          {fmtNum(build.tokens)} tok / {fmtMs(build.durationMs)}
        </td>
        <td className="py-2 pr-3 text-slate-300 whitespace-nowrap">
          {fmtNum(runtime.tokens)} tok / {fmtMs(runtime.durationMs)}
        </td>
        <td className="py-2 pr-3 font-semibold">{renderFidelity()}</td>
        <td className="py-2">
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
          >
            {open ? "Close" : "Evaluate"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} className="pb-4">
            <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs text-slate-400">
                  Fidelity (0–100%) — how close to the vision?
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  className="w-24 px-2 py-1 bg-slate-950 border border-slate-700 rounded text-sm text-slate-100"
                />
              </div>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
                placeholder="Notes on how this attempt compared to the vision…"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={saveEval}
                  disabled={saving}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white text-sm font-medium rounded transition-colors"
                >
                  {saving ? "Saving…" : "Save Evaluation"}
                </button>
                {acceptanceMode === "program" ? (
                  <button
                    onClick={runVerify}
                    disabled={verifying}
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-emerald-900 text-white text-sm font-medium rounded transition-colors"
                  >
                    {verifying ? "Running…" : "Run Acceptance Test"}
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">
                    Acceptance mode is “{acceptanceMode}”. Set mode to “program”
                    and add a <code>verify</code> script to run an automated
                    test.
                  </span>
                )}
                {error && <span className="text-xs text-red-400">{error}</span>}
              </div>
              {verifyOut && (
                <div className="bg-black rounded p-3 font-mono text-xs text-green-400 border border-slate-900">
                  <div
                    className={
                      verifyOut.passed ? "text-green-400" : "text-red-400"
                    }
                  >
                    &gt; Acceptance test {verifyOut.passed ? "PASSED" : "FAILED"}
                  </div>
                  <RunResult output={verifyOut} />
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function MetricsModal({ item, onClose, onCardRefresh }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/scan/${item.id}/manifest`);
      if (res.ok) {
        setData(await res.json());
      } else {
        setData(null);
      }
    } catch (e) {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [item.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const afterChange = async () => {
    await reload();
    if (onCardRefresh) onCardRefresh();
  };

  const spec = data && data.spec;
  const attempts = (data && data.attempts) || [];
  const acceptanceMode =
    spec && spec.acceptance ? spec.acceptance.mode : "human";

  const buildTokenSeries = attempts.map((a) =>
    a.build && typeof a.build.tokens === "number" ? a.build.tokens : null,
  );
  const buildTimeSeries = attempts.map((a) =>
    a.build && typeof a.build.durationMs === "number"
      ? a.build.durationMs
      : null,
  );
  const fidelitySeries = attempts.map((a) =>
    a.evaluation && typeof a.evaluation.fidelityScore === "number"
      ? a.evaluation.fidelityScore
      : null,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="p-6 border-b border-slate-700 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-100">
              {item.name} — Vision &amp; Metrics
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Track tokens, time, model, environment, and fidelity across every
              attempt.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-semibold"
          >
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              Loading metrics…
            </div>
          ) : (
            <>
              {data && data.manifestStatus === "corrupt" && (
                <div className="bg-red-950/40 border border-red-800 rounded-lg p-4 text-red-300 text-sm">
                  ⚠ This one-shot's <code>oneshot.json</code> is corrupt and could
                  not be parsed. Recorded data is shown as empty, and writes are
                  blocked to avoid overwriting it. Fix or remove the file to
                  continue.
                </div>
              )}

              {/* Vision */}
              {spec && spec.vision ? (
                <div className="bg-blue-950/40 border border-blue-800/60 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-blue-300 uppercase tracking-wide">
                      Vision (immutable)
                    </h3>
                    <span className="text-xs text-slate-400">
                      {spec.createdAt
                        ? `Set ${new Date(spec.createdAt).toLocaleDateString()}`
                        : ""}
                      {spec.acceptance
                        ? ` · ${spec.acceptance.mode} evaluation`
                        : ""}
                    </span>
                  </div>
                  <p className="text-slate-200 mt-2 whitespace-pre-wrap">
                    {spec.vision}
                  </p>
                </div>
              ) : (
                <SetVisionForm id={item.id} onCreated={afterChange} />
              )}

              {/* Trend */}
              {attempts.length >= 2 && (
                <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-slate-200 mb-3">
                    Trends across {attempts.length} attempts (oldest → newest)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">
                        Build tokens (lower is better)
                      </div>
                      <Sparkline values={buildTokenSeries} stroke="#f59e0b" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">
                        Build time (lower is better)
                      </div>
                      <Sparkline values={buildTimeSeries} stroke="#38bdf8" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">
                        Fidelity % (higher is better)
                      </div>
                      <Sparkline values={fidelitySeries} stroke="#34d399" />
                    </div>
                  </div>
                </div>
              )}

              {/* Attempts table */}
              <div>
                <h3 className="text-sm font-semibold text-slate-200 mb-2">
                  Attempt history ({attempts.length})
                </h3>
                {attempts.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No attempts recorded yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="text-slate-500 uppercase tracking-wide">
                          <th className="py-2 pr-3 font-medium">When</th>
                          <th className="py-2 pr-3 font-medium">Model</th>
                          <th className="py-2 pr-3 font-medium">Environment</th>
                          <th className="py-2 pr-3 font-medium">Build</th>
                          <th className="py-2 pr-3 font-medium">Runtime</th>
                          <th className="py-2 pr-3 font-medium">Fidelity</th>
                          <th className="py-2 font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {attempts
                          .slice()
                          .reverse()
                          .map((attempt) => (
                            <AttemptRow
                              key={attempt.id}
                              id={item.id}
                              attempt={attempt}
                              acceptanceMode={acceptanceMode}
                              onChanged={afterChange}
                            />
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Record attempt */}
              <RecordAttemptForm id={item.id} onAdded={afterChange} />
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Compact metrics summary shown on each card.
function CardMetrics({ manifest }) {
  if (!manifest) return null;
  if (manifest.manifestStatus === "corrupt") {
    return (
      <div className="text-xs text-red-400 mb-3 font-semibold">
        ⚠ manifest unreadable (corrupt)
      </div>
    );
  }
  if (!manifest.hasManifest) {
    return (
      <div className="text-xs text-slate-600 mb-3 italic">
        No vision/metrics recorded yet
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
      {manifest.hasVision && (
        <span className="bg-blue-950 text-blue-300 border border-blue-800 px-2 py-0.5 rounded">
          Vision
        </span>
      )}
      {manifest.attemptCount > 0 && (
        <span className="text-slate-400">↻ {manifest.attemptCount} attempts</span>
      )}
      {typeof manifest.latestFidelity === "number" ? (
        <span className={`font-semibold ${fidelityColor(manifest.latestFidelity)}`}>
          ★ {manifest.latestFidelity}%
        </span>
      ) : typeof manifest.latestPassed === "boolean" ? (
        <span
          className={`font-semibold ${manifest.latestPassed ? "text-green-400" : "text-red-400"}`}
        >
          {manifest.latestPassed ? "✓ pass" : "✗ fail"}
        </span>
      ) : null}
    </div>
  );
}

export default function DashboardClient({
  initialItems,
  initialStats,
  initialScanError,
}) {
  const [oneShots, setOneShots] = useState(initialItems || []);
  const [statsData, setStatsData] = useState(
    initialStats || { totalRuns: 0, failedRuns: 0 },
  );
  const [scanError, setScanError] = useState(initialScanError || false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("");

  // Preview Modal state
  const [previewItem, setPreviewItem] = useState(null);
  const [readmeContent, setReadmeContent] = useState("");
  const [loadingReadme, setLoadingReadme] = useState(false);

  // Run Modal state
  const [runningItem, setRunningItem] = useState(null);
  const [runAction, setRunAction] = useState("test");
  const [isRunning, setIsRunning] = useState(false);
  const [runOutput, setRunOutput] = useState(null);

  // Metrics / Details Modal state
  const [detailItem, setDetailItem] = useState(null);

  // Load all unique tags from one-shots
  const allTags = React.useMemo(() => {
    const tagsSet = new Set();
    oneShots.forEach((item) => {
      if (Array.isArray(item.tags)) {
        item.tags.forEach((tag) => {
          if (tag && typeof tag === "string") {
            tagsSet.add(tag);
          }
        });
      }
    });
    return Array.from(tagsSet).sort();
  }, [oneShots]);

  const handleRefresh = async () => {
    try {
      const res = await fetch("/api/scan");
      if (res.ok) {
        const data = await res.json();
        setOneShots(data);
        setScanError(false);
      } else {
        setScanError(true);
      }
    } catch (e) {
      setScanError(true);
    }

    // Also refresh stats
    try {
      const statsRes = await fetch("/api/stats");
      if (statsRes.ok) {
        const statsVal = await statsRes.json();
        setStatsData(statsVal);
      }
    } catch (e) {
      // Ignore stats fetch failure
    }
  };

  const handlePreview = async (item) => {
    setPreviewItem(item);
    setLoadingReadme(true);
    setReadmeContent("Loading README...");
    try {
      const res = await fetch(`/api/scan/${item.id}/readme`);
      if (res.ok) {
        const data = await res.json();
        setReadmeContent(data.readme || "No README content found.");
      } else {
        setReadmeContent("Error loading README.");
      }
    } catch (e) {
      setReadmeContent("Error loading README.");
    } finally {
      setLoadingReadme(false);
    }
  };

  const handleRun = async () => {
    if (!runningItem) return;
    setIsRunning(true);
    setRunOutput(null);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: runningItem.id, action: runAction }),
      });
      const data = await res.json();
      setRunOutput(data);
    } catch (e) {
      setRunOutput({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "Network error occurred while calling run endpoint.",
        error: "Execution failed",
      });
    } finally {
      setIsRunning(false);
      // Fetch updated stats
      try {
        const statsRes = await fetch("/api/stats");
        if (statsRes.ok) {
          const statsVal = await statsRes.json();
          setStatsData(statsVal);
        }
      } catch (e) {
        // Ignore
      }
    }
  };

  const filteredItems = React.useMemo(() => {
    return oneShots.filter((item) => {
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        (item.name && item.name.toLowerCase().includes(query)) ||
        (item.description && item.description.toLowerCase().includes(query));

      const matchesTag =
        !selectedTag ||
        (item.tags &&
          item.tags.some((t) => t.toLowerCase() === selectedTag.toLowerCase()));

      return matchesSearch && matchesTag;
    });
  }, [oneShots, searchQuery, selectedTag]);

  const total = statsData.totalRuns || 0;
  const failed = statsData.failedRuns || 0;
  const successRate =
    total > 0 ? Math.round(((total - failed) / total) * 100) : 100;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-800 p-6 flex flex-col border-r border-slate-700">
        <div className="flex items-center space-x-2 mb-8">
          <span className="text-xl font-bold tracking-wide text-blue-400">
            OneShotForge
          </span>
        </div>

        <nav className="flex-1 space-y-4">
          <div className="text-sm font-semibold uppercase text-slate-500 tracking-wider">
            Navigation
          </div>
          <a
            href="#"
            className="flex items-center space-x-2 text-slate-300 hover:text-white transition-colors"
          >
            <span>Dashboard</span>
          </a>
        </nav>

        {/* Stats Section */}
        <div className="mt-auto pt-6 border-t border-slate-700 space-y-3">
          <div className="text-sm font-semibold uppercase text-slate-500 tracking-wider">
            Statistics
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Total Runs:</span>
              <span className="font-mono text-blue-400">{total}</span>
            </div>
            <div className="flex justify-between">
              <span>Failed Runs:</span>
              <span className="font-mono text-red-400">{failed}</span>
            </div>
            <div className="flex justify-between border-t border-slate-700/50 pt-2">
              <span>Success Rate:</span>
              <span className="font-mono text-green-400">{successRate}%</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              OneShotForge
            </h1>
            <p className="text-slate-400 mt-1">
              Manage and run your isolated scripts and scraper tasks.
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <button
              id="refresh"
              onClick={handleRefresh}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors"
            >
              Refresh Scan
            </button>
          </div>
        </div>

        {/* Error Banner Container */}
        <div
          id="error-banner"
          className={`${scanError ? "" : "hidden"} mb-6 p-4 bg-red-900/50 border border-red-500 rounded text-red-200`}
        >
          Error loading scan: Failed to read one-shots directory.
        </div>

        {/* Filters and Search Bar */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="w-full md:w-1/2">
            <label htmlFor="search-input" className="sr-only">
              Search
            </label>
            <input
              id="search-input"
              type="text"
              placeholder="Search one-shots..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="w-full md:w-auto flex items-center space-x-2 overflow-x-auto">
            <span className="text-sm text-slate-400 whitespace-nowrap">
              Filter Tags:
            </span>
            <button
              onClick={() => setSelectedTag("")}
              className={`px-3 py-1 text-xs rounded transition-colors border ${
                selectedTag === ""
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600"
              }`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`px-3 py-1 text-xs rounded transition-colors border ${
                  selectedTag === tag
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Grid layout for one-shots */}
        {filteredItems.length === 0 ? (
          <div className="text-center py-12 bg-slate-800/50 border border-slate-800 rounded-lg">
            <p className="text-slate-400">
              No one-shots found matching your filters.
            </p>
          </div>
        ) : null}

        <div
          className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${filteredItems.length === 0 ? "hidden" : ""}`}
        >
          {filteredItems.map((item) => (
            <div
              key={item.id}
              id={item.id}
              className={`${item.id} bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition-colors flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <h3
                    onClick={() => setDetailItem(item)}
                    className="text-lg font-bold text-slate-100 cursor-pointer hover:text-blue-300 transition-colors"
                    title="View vision & metrics"
                  >
                    {item.name}
                  </h3>
                  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-mono">
                    v{item.version}
                  </span>
                </div>
                <p className="text-slate-400 text-sm mt-2 line-clamp-3">
                  {item.description}
                </p>
              </div>

              <div className="mt-4">
                <CardMetrics manifest={item.manifest} />

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {Array.isArray(item.tags) &&
                    item.tags.map((tag) => (
                      <span
                        key={tag}
                        onClick={() => setSelectedTag(tag)}
                        className="text-xs bg-blue-950 text-blue-300 border border-blue-800 px-2 py-0.5 rounded cursor-pointer hover:bg-blue-900 transition-colors"
                      >
                        {tag}
                      </span>
                    ))}
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={() => handlePreview(item)}
                    className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 text-sm font-medium rounded transition-colors text-center"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => setDetailItem(item)}
                    className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 text-sm font-medium rounded transition-colors text-center"
                  >
                    Details
                  </button>
                  <button
                    onClick={() => {
                      setRunningItem(item);
                      setRunAction("test");
                      setRunOutput(null);
                      setIsRunning(false);
                    }}
                    className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-sm font-medium rounded transition-colors text-center"
                  >
                    Run
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-slate-700 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-100">
                  {previewItem.name} - README
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {previewItem.path}
                </p>
              </div>
              <button
                onClick={() => setPreviewItem(null)}
                className="text-slate-400 hover:text-white text-lg font-semibold"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 prose prose-invert max-w-none text-slate-300">
              {loadingReadme ? (
                <div className="flex items-center justify-center py-12">
                  <span className="text-slate-400">
                    Loading README content...
                  </span>
                </div>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: readmeContent }} />
              )}
            </div>
            <div className="p-4 border-t border-slate-700 flex justify-end">
              <button
                onClick={() => setPreviewItem(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metrics / Details Modal */}
      {detailItem && (
        <MetricsModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onCardRefresh={handleRefresh}
        />
      )}

      {/* Run Script Console Dialog */}
      {runningItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-slate-700 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-100">
                  Run: {runningItem.name}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Execute defined package script targets
                </p>
              </div>
              <button
                onClick={() => setRunningItem(null)}
                className="text-slate-400 hover:text-white text-lg font-semibold"
                disabled={isRunning}
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 flex flex-col space-y-4">
              <div className="flex items-center space-x-4">
                <span className="text-sm font-semibold text-slate-300">
                  Select Script Target:
                </span>
                <select
                  value={runAction}
                  onChange={(e) => setRunAction(e.target.value)}
                  disabled={isRunning}
                  className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="test">test</option>
                  <option value="start">start</option>
                  <option value="verify">verify</option>
                </select>
                <button
                  onClick={handleRun}
                  disabled={isRunning}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-medium text-sm rounded transition-colors flex items-center space-x-2"
                >
                  {isRunning ? "Executing..." : "Run"}
                </button>
              </div>

              {/* Formatted output console */}
              <div className="flex-1 flex flex-col min-h-[300px]">
                <span className="text-xs font-semibold text-slate-400 mb-1">
                  Execution Console Log:
                </span>
                <div className="flex-1 bg-black rounded p-4 font-mono text-xs overflow-y-auto text-green-400 space-y-2 border border-slate-950">
                  {isRunning && (
                    <div className="text-yellow-400 animate-pulse">
                      &gt; Executing script target "{runAction}"... Please wait.
                    </div>
                  )}

                  {!isRunning && !runOutput && (
                    <div className="text-slate-500">
                      Console idle. Click Run to begin execution.
                    </div>
                  )}

                  {runOutput && <RunResult output={runOutput} />}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-700 flex justify-end">
              <button
                onClick={() => setRunningItem(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium transition-colors"
                disabled={isRunning}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
