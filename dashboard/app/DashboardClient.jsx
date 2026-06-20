'use client';

import React, { useState, useEffect } from 'react';

// --- Small presentational helpers (shared across modals) ---

function fidelityColor(score) {
  if (typeof score !== 'number') return 'text-slate-400';
  if (score >= 80) return 'text-green-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function fmtMs(ms) {
  if (typeof ms !== 'number' || !isFinite(ms)) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

function fmtNum(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  return n.toLocaleString();
}

// Finished-execution console block, reused by the Run modal and acceptance test.
function RunResult({ output }) {
  if (!output) return null;
  return (
    <div className="space-y-2">
      <div className={output.success ? 'text-green-400' : 'text-red-400'}>
        &gt; Execution finished with exit code:{' '}
        {output.exitCode !== null ? output.exitCode : 'Killed/Timeout'}
      </div>

      {output.error && <div className="text-red-500 font-bold">[ERROR]: {output.error}</div>}

      {output.stdout && (
        <div>
          <div className="text-slate-400 border-b border-slate-800 pb-1 mb-1 font-semibold">
            stdout:
          </div>
          <pre className="whitespace-pre-wrap text-slate-300">{output.stdout}</pre>
        </div>
      )}

      {output.stderr && (
        <div>
          <div className="text-red-400 border-b border-slate-800 pb-1 mb-1 font-semibold">
            stderr:
          </div>
          <pre className="whitespace-pre-wrap text-red-300">{output.stderr}</pre>
        </div>
      )}
    </div>
  );
}

// Zero-dependency trend line (no charting library, matching the project ethos).
function Sparkline({ values, stroke = '#60a5fa', width = 160, height = 32 }) {
  const valid = values.filter((v) => typeof v === 'number' && isFinite(v));
  if (valid.length < 2) {
    return <span className="text-slate-600 text-xs">not enough data</span>;
  }
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const denom = values.length > 1 ? values.length - 1 : 1;
  const pts = [];
  values.forEach((v, i) => {
    if (typeof v !== 'number' || !isFinite(v)) return;
    const x = (i / denom) * width;
    const y = height - ((v - min) / range) * height;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  return (
    <svg width={width} height={height} className="block">
      <polyline points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}

// --- Forms ---

function SetVisionForm({ id, onCreated }) {
  const [vision, setVision] = useState('');
  const [mode, setMode] = useState('human');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!vision.trim()) {
      setError('Vision text is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/manifest/spec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, vision, acceptance: { mode } }),
      });
      const data = await res.json();
      if (res.ok) {
        onCreated();
      } else {
        setError(data.error || 'Failed to save vision.');
      }
    } catch (e) {
      setError('Network error saving vision.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-blue-900/60 rounded-lg p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-blue-300">Set the Vision (write-once)</h3>
        <p className="text-xs text-slate-400 mt-1">
          Describe what success looks like. Once saved this is permanent and never deleted — it is
          the benchmark every future attempt is measured against.
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
          {saving ? 'Saving…' : 'Save Vision'}
        </button>
      </div>
      {error && <div className="text-xs text-red-400">{error}</div>}
    </div>
  );
}

function RecordAttemptForm({ id, onAdded }) {
  // Collapsed by default — manual entry is rarely needed now that the recorder
  // captures attempts automatically; it lives behind a toggle.
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState('');
  // Kept separate (not merged) so a manual entry maps cleanly onto the same
  // tool/toolBuild/os/osBuild fields the recorder writes; the related inputs
  // just share a row in the layout below.
  const [tool, setTool] = useState('');
  const [toolBuild, setToolBuild] = useState('');
  const [os, setOs] = useState('');
  const [osBuild, setOsBuild] = useState('');
  const [buildTokens, setBuildTokens] = useState('');
  const [buildMs, setBuildMs] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toNum = (v) => (v === '' ? null : Number(v));

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/manifest/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          model,
          environment: { tool, toolBuild, os, osBuild },
          build: { tokens: toNum(buildTokens), durationMs: toNum(buildMs) },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setModel('');
        setTool('');
        setToolBuild('');
        setOs('');
        setOsBuild('');
        setBuildTokens('');
        setBuildMs('');
        onAdded();
      } else {
        setError(data.error || 'Failed to record attempt.');
      }
    } catch (e) {
      setError('Network error recording attempt.');
    } finally {
      setSaving(false);
    }
  };

  const input =
    'px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500';

  return (
    <div className="bg-slate-900/60 border border-slate-700 rounded-lg">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-200 hover:text-white transition-colors"
      >
        <span>Record a build attempt manually</span>
        <span className="text-xs font-normal text-slate-400">{open ? '▲ hide' : '▼ show'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-slate-500">
            Rarely needed — most attempts are captured automatically by the recorder.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              className={`${input} sm:col-span-2`}
              placeholder="Model (e.g. Gemini 3.5 Flash (high))"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
            {/* Tool + its build share a row; OS + its build share the next. */}
            <input
              className={input}
              placeholder="Tool (e.g. claude-code)"
              value={tool}
              onChange={(e) => setTool(e.target.value)}
            />
            <input
              className={input}
              placeholder="Tool build (e.g. 2.1.181)"
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
              placeholder="OS build (e.g. 26100)"
              value={osBuild}
              onChange={(e) => setOsBuild(e.target.value)}
            />
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
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={submit}
              disabled={saving}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white text-sm font-medium rounded transition-colors"
            >
              {saving ? 'Saving…' : 'Add Attempt'}
            </button>
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// Maps an attempt's evidence level (computed server-side in lib/manifest.js) to
// a compact badge so the user can see at a glance whether the telemetry is
// trustworthy for benchmarking.
function evidenceMeta(level) {
  switch (level) {
    case 'provider_reconciled':
      return { label: 'provider', cls: 'text-emerald-300 border-emerald-700' };
    case 'vendor_session_store':
      return { label: 'session', cls: 'text-emerald-300 border-emerald-700' };
    case 'native_telemetry':
      return { label: 'telemetry', cls: 'text-emerald-300 border-emerald-700' };
    case 'system_probe':
      return { label: 'timed-only', cls: 'text-sky-300 border-sky-800' };
    case 'manual_attestation':
      return { label: 'manual', cls: 'text-amber-300 border-amber-700' };
    case 'legacy_self_reported':
      return { label: 'legacy', cls: 'text-slate-400 border-slate-700' };
    default:
      return { label: 'n/a', cls: 'text-slate-500 border-slate-800' };
  }
}

function AttemptRow({ id, attempt, acceptanceMode, onChanged }) {
  const ev = attempt.evaluation || {};
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(
    typeof ev.fidelityScore === 'number' ? String(ev.fidelityScore) : ''
  );
  const [feedback, setFeedback] = useState(typeof ev.feedback === 'string' ? ev.feedback : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyOut, setVerifyOut] = useState(null);

  const env = attempt.environment || {};
  const build = attempt.build || {};

  const saveEval = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/manifest/evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          attemptId: attempt.id,
          method: 'human',
          fidelityScore: score === '' ? null : Number(score),
          feedback,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onChanged();
      } else {
        setError(data.error || 'Failed to save evaluation.');
      }
    } catch (e) {
      setError('Network error saving evaluation.');
    } finally {
      setSaving(false);
    }
  };

  const runVerify = async () => {
    setVerifying(true);
    setVerifyOut(null);
    setError('');
    try {
      const res = await fetch('/api/manifest/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, attemptId: attempt.id }),
      });
      const data = await res.json();
      setVerifyOut(data);
      if (res.ok) {
        onChanged();
      } else {
        setError(data.error || 'Acceptance test could not run.');
      }
    } catch (e) {
      setError('Network error running acceptance test.');
    } finally {
      setVerifying(false);
    }
  };

  const renderFidelity = () => {
    if (ev.method === 'program' && typeof ev.passed === 'boolean') {
      return (
        <span className={ev.passed ? 'text-green-400' : 'text-red-400'}>
          {ev.passed ? '✓ pass' : '✗ fail'}
        </span>
      );
    }
    if (typeof ev.fidelityScore === 'number') {
      return <span className={fidelityColor(ev.fidelityScore)}>{ev.fidelityScore}%</span>;
    }
    return <span className="text-slate-600">—</span>;
  };

  // Tool + build on one line, OS + build on one line (per operator preference).
  const toolLabel = [env.tool, env.toolBuild].filter(Boolean).join(' ') || '—';
  const osLabel = [env.os, env.osBuild].filter(Boolean).join(' ') || '—';
  const envLabel =
    [env.tool, env.toolBuild].filter(Boolean).join(' ') +
    (env.os || env.osBuild ? ` / ${[env.os, env.osBuild].filter(Boolean).join(' ')}` : '');
  // The "setting" the operator asked to see: effort and/or speed.
  const settingLabel =
    [env.effort ? `${env.effort} effort` : null, env.speed ? `${env.speed} speed` : null]
      .filter(Boolean)
      .join(' · ') || '—';

  return (
    <>
      <tr className="border-t border-slate-800">
        <td className="py-2 pr-3 text-slate-400 whitespace-nowrap">
          {attempt.timestamp ? new Date(attempt.timestamp).toLocaleString() : '—'}
        </td>
        <td className="py-2 pr-3 text-slate-200">
          <div className="flex flex-col gap-1">
            <span>{attempt.model || '—'}</span>
            <span className="flex items-center gap-1 flex-wrap">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded border ${evidenceMeta(attempt.evidenceLevel).cls}`}
                title={`Evidence level: ${attempt.evidenceLevel || 'n/a'}`}
              >
                {evidenceMeta(attempt.evidenceLevel).label}
              </span>
              {attempt.benchmarkEligible && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-700"
                  title="Trusted, measured telemetry — counts toward benchmarks"
                >
                  ✓ benchmark
                </span>
              )}
            </span>
          </div>
        </td>
        <td className="py-2 pr-3 text-slate-400">{envLabel || '—'}</td>
        <td className="py-2 pr-3 text-slate-300 whitespace-nowrap">
          {fmtNum(build.tokens)} tok / {fmtMs(build.durationMs)}
        </td>
        <td className="py-2 pr-3 text-amber-400 font-mono">
          {typeof attempt.estimatedCost === 'number' ? `$${attempt.estimatedCost.toFixed(4)}` : '—'}
        </td>
        <td className="py-2 pr-3 font-semibold">{renderFidelity()}</td>
        <td className="py-2">
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
          >
            {open ? 'Close' : 'Evaluate'}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} className="pb-4">
            <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-3">
              {/* What was built, who/what built it, where, and how much it took.
                  Captured automatically from the build session — no human input. */}
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                  Build details
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <dt className="text-[11px] text-slate-500">Model</dt>
                    <dd className="text-slate-200">{attempt.model || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-500">Setting (effort / speed)</dt>
                    <dd className="text-slate-200">{settingLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-500">Tool + build</dt>
                    <dd className="text-slate-200">{toolLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-500">OS + build</dt>
                    <dd className="text-slate-200">{osLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-500">Build tokens</dt>
                    <dd className="text-slate-200">{fmtNum(build.tokens)} tok</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-500">Build time</dt>
                    <dd className="text-slate-200">{fmtMs(build.durationMs)}</dd>
                  </div>
                </dl>
              </div>
              <div className="border-t border-slate-800" />
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
                  {saving ? 'Saving…' : 'Save Evaluation'}
                </button>
                {acceptanceMode === 'program' ? (
                  <button
                    onClick={runVerify}
                    disabled={verifying}
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-emerald-900 text-white text-sm font-medium rounded transition-colors"
                  >
                    {verifying ? 'Running…' : 'Run Acceptance Test'}
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">
                    Acceptance mode is “{acceptanceMode}”. Set mode to “program” and add a{' '}
                    <code>verify</code> script to run an automated test.
                  </span>
                )}
                {error && <span className="text-xs text-red-400">{error}</span>}
              </div>
              {verifyOut && (
                <div className="bg-black rounded p-3 font-mono text-xs text-green-400 border border-slate-900">
                  <div className={verifyOut.passed ? 'text-green-400' : 'text-red-400'}>
                    &gt; Acceptance test {verifyOut.passed ? 'PASSED' : 'FAILED'}
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
  const acceptanceMode = spec && spec.acceptance ? spec.acceptance.mode : 'human';

  const buildTokenSeries = attempts.map((a) =>
    a.build && typeof a.build.tokens === 'number' ? a.build.tokens : null
  );
  const buildTimeSeries = attempts.map((a) =>
    a.build && typeof a.build.durationMs === 'number' ? a.build.durationMs : null
  );
  const fidelitySeries = attempts.map((a) =>
    a.evaluation && typeof a.evaluation.fidelityScore === 'number'
      ? a.evaluation.fidelityScore
      : null
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="p-6 border-b border-slate-700 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-100">{item.name} — Vision &amp; Metrics</h2>
            <p className="text-xs text-slate-400 mt-1">
              Track tokens, time, model, environment, and fidelity across every attempt.
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
              {data && data.manifestStatus === 'corrupt' && (
                <div className="bg-red-950/40 border border-red-800 rounded-lg p-4 text-red-300 text-sm">
                  ⚠ This one-shot&apos;s <code>oneshot.json</code> is corrupt and could not be
                  parsed. Recorded data is shown as empty, and writes are blocked to avoid
                  overwriting it. Fix or remove the file to continue.
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
                      {spec.createdAt ? `Set ${new Date(spec.createdAt).toLocaleDateString()}` : ''}
                      {spec.acceptance ? ` · ${spec.acceptance.mode} evaluation` : ''}
                    </span>
                  </div>
                  <p className="text-slate-200 mt-2 whitespace-pre-wrap">{spec.vision}</p>
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
                  Attempt history ({attempts.length}
                  {attempts.length > 0 && (
                    <span className="text-slate-400 font-normal">
                      {' · '}
                      {attempts.filter((a) => a.benchmarkEligible).length} benchmark-eligible
                    </span>
                  )}
                  )
                </h3>
                {attempts.length === 0 ? (
                  <p className="text-sm text-slate-500">No attempts recorded yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="text-slate-500 uppercase tracking-wide">
                          <th className="py-2 pr-3 font-medium">When</th>
                          <th className="py-2 pr-3 font-medium">Model</th>
                          <th className="py-2 pr-3 font-medium">Environment</th>
                          <th className="py-2 pr-3 font-medium">Build</th>
                          <th className="py-2 pr-3 font-medium">Est. Cost</th>
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
  if (manifest.manifestStatus === 'corrupt') {
    return (
      <div className="text-xs text-red-400 mb-3 font-semibold">⚠ manifest unreadable (corrupt)</div>
    );
  }
  if (!manifest.hasManifest) {
    return <div className="text-xs text-slate-600 mb-3 italic">No vision/metrics recorded yet</div>;
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
      {typeof manifest.latestFidelity === 'number' ? (
        <span className={`font-semibold ${fidelityColor(manifest.latestFidelity)}`}>
          ★ {manifest.latestFidelity}%
        </span>
      ) : typeof manifest.latestPassed === 'boolean' ? (
        <span
          className={`font-semibold ${manifest.latestPassed ? 'text-green-400' : 'text-red-400'}`}
        >
          {manifest.latestPassed ? '✓ pass' : '✗ fail'}
        </span>
      ) : null}
    </div>
  );
}

export default function DashboardClient({ initialItems, initialStats, initialScanError }) {
  const [oneShots, setOneShots] = useState(initialItems || []);
  const [statsData, setStatsData] = useState(initialStats || { totalRuns: 0, failedRuns: 0 });
  const [scanError, setScanError] = useState(initialScanError || false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');

  // Preview Modal state
  const [previewItem, setPreviewItem] = useState(null);
  const [readmeContent, setReadmeContent] = useState('');
  const [loadingReadme, setLoadingReadme] = useState(false);

  // Run Modal state
  const [runningItem, setRunningItem] = useState(null);
  const [runAction, setRunAction] = useState('test');
  const [isRunning, setIsRunning] = useState(false);
  const [runOutput, setRunOutput] = useState(null);

  // Metrics / Details Modal state
  const [detailItem, setDetailItem] = useState(null);

  // Ideas Registry state
  const [activeTab, setActiveTab] = useState('dashboard');
  const [ideas, setIdeas] = useState([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [ideasSearchQuery, setIdeasSearchQuery] = useState('');
  const [selectedIdeaCategory, setSelectedIdeaCategory] = useState('');
  const [selectedIdeaStack, setSelectedIdeaStack] = useState('');
  const [selectedIdeaStatus, setSelectedIdeaStatus] = useState('');
  const [selectedIdeaDetail, setSelectedIdeaDetail] = useState(null);
  const [showAddIdeaModal, setShowAddIdeaModal] = useState(false);
  const [addIdeaForm, setAddIdeaForm] = useState({
    title: '',
    category: '',
    vision: '',
    techSpecs: '',
    targetStack: '',
    readyToCopyTaskPrompt: '',
  });
  const [addIdeaError, setAddIdeaError] = useState('');
  const [addIdeaSuccess, setAddIdeaSuccess] = useState('');
  const [submittingIdea, setSubmittingIdea] = useState(false);

  const [promotingIdeaId, setPromotingIdeaId] = useState(null);

  const [promptVariables, setPromptVariables] = useState({});

  useEffect(() => {
    if (selectedIdeaDetail && selectedIdeaDetail.readyToCopyTaskPrompt) {
      const prompt = selectedIdeaDetail.readyToCopyTaskPrompt;
      const stack = selectedIdeaDetail.targetStack || '';
      const regex = /\{\{([^}]+)\}\}/g;
      let match;
      const vars = {};
      while ((match = regex.exec(prompt)) !== null) {
        const varName = match[1].trim();
        const varNameLower = varName.toLowerCase();
        if (vars[varName]) continue;

        // compute default
        if (varNameLower === 'language') {
          if (stack.toLowerCase().includes('python')) {
            vars[varName] = 'Python';
          } else if (/\b(node|js|react|typescript|javascript)\b/i.test(stack)) {
            vars[varName] = 'JavaScript';
          } else if (stack.toLowerCase().includes('rust')) {
            vars[varName] = 'Rust';
          } else {
            vars[varName] = 'Python';
          }
        } else if (varNameLower === 'framework') {
          if (stack.toLowerCase().includes('playwright')) {
            vars[varName] = 'Playwright';
          } else if (stack.toLowerCase().includes('crawl4ai')) {
            vars[varName] = 'Crawl4AI';
          } else if (stack.toLowerCase().includes('fastapi')) {
            vars[varName] = 'FastAPI';
          } else if (stack.toLowerCase().includes('express')) {
            vars[varName] = 'Express';
          } else if (stack.toLowerCase().includes('next.js')) {
            vars[varName] = 'Next.js';
          } else {
            vars[varName] = 'Playwright';
          }
        } else if (varNameLower === 'database' || varNameLower === 'db') {
          if (stack.toLowerCase().includes('sqlite')) {
            vars[varName] = 'SQLite';
          } else if (stack.toLowerCase().includes('postgres')) {
            vars[varName] = 'PostgreSQL';
          } else {
            vars[varName] = 'SQLite';
          }
        } else {
          vars[varName] = varName;
        }
      }
      setPromptVariables(vars);
    } else {
      setPromptVariables({});
    }
  }, [selectedIdeaDetail]);

  const compiledPrompt = React.useMemo(() => {
    if (!selectedIdeaDetail || !selectedIdeaDetail.readyToCopyTaskPrompt) return '';
    let prompt = selectedIdeaDetail.readyToCopyTaskPrompt;
    Object.entries(promptVariables).forEach(([key, val]) => {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'g');
      prompt = prompt.replace(regex, val);
    });
    return prompt;
  }, [selectedIdeaDetail, promptVariables]);

  const fetchIdeas = async () => {
    setLoadingIdeas(true);
    try {
      const res = await fetch('/api/ideas');
      if (res.ok) {
        const data = await res.json();
        setIdeas(data);
      }
    } catch (e) {
      console.error('Error fetching ideas:', e);
    } finally {
      setLoadingIdeas(false);
    }
  };

  const handlePromoteIdea = async (idea) => {
    if (!idea || promotingIdeaId) return;
    setPromotingIdeaId(idea.id);
    try {
      const res = await fetch('/api/ideas/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idea.id }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Successfully promoted idea to one-shots/${data.slug}!`);
        setSelectedIdeaDetail(null);
        await fetchIdeas();
        await handleRefresh();
      } else {
        alert(`Failed to promote idea: ${data.error}`);
      }
    } catch (e) {
      alert('Network error while promoting idea.');
    } finally {
      setPromotingIdeaId(null);
    }
  };

  useEffect(() => {
    fetchIdeas();
  }, []);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'ideas') {
      fetchIdeas();
    }
  };

  const IDEAS_CATEGORIES = [
    'Automotive & B2B Lead Generation Tools',
    'AI Development, Prompting, Routing & Evaluation Tools',
    'Agent Orchestration, Governance & Sandbox Frameworks',
    'Codebase Engineering & Git Workflow Enhancers',
    'Data, Document & Workspace Productivity Tools',
    'Micro-SaaS Templates & Personal Workflow Apps',
  ];

  const allIdeaStacks = React.useMemo(() => {
    const stacksSet = new Set();
    ideas.forEach((idea) => {
      if (idea.targetStack) {
        idea.targetStack.split(',').forEach((s) => {
          const trimmed = s.trim();
          if (trimmed) {
            stacksSet.add(trimmed);
          }
        });
      }
    });
    return Array.from(stacksSet).sort();
  }, [ideas]);

  const filteredIdeas = React.useMemo(() => {
    return ideas.filter((idea) => {
      const q = ideasSearchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (idea.title && idea.title.toLowerCase().includes(q)) ||
        (idea.vision && idea.vision.toLowerCase().includes(q)) ||
        (idea.id && idea.id.toLowerCase().includes(q));

      const matchesCategory = !selectedIdeaCategory || idea.category === selectedIdeaCategory;

      const matchesStack =
        !selectedIdeaStack ||
        (idea.targetStack &&
          idea.targetStack.toLowerCase().includes(selectedIdeaStack.toLowerCase()));

      const matchesStatus = !selectedIdeaStatus || idea.status === selectedIdeaStatus;

      return matchesSearch && matchesCategory && matchesStack && matchesStatus;
    });
  }, [ideas, ideasSearchQuery, selectedIdeaCategory, selectedIdeaStack, selectedIdeaStatus]);

  // Load all unique tags from one-shots
  const allTags = React.useMemo(() => {
    const tagsSet = new Set();
    oneShots.forEach((item) => {
      if (Array.isArray(item.tags)) {
        item.tags.forEach((tag) => {
          if (tag && typeof tag === 'string') {
            tagsSet.add(tag);
          }
        });
      }
    });
    return Array.from(tagsSet).sort();
  }, [oneShots]);

  const handleRefresh = async () => {
    try {
      const res = await fetch('/api/scan');
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
      const statsRes = await fetch('/api/stats');
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
    setReadmeContent('Loading README...');
    try {
      const res = await fetch(`/api/scan/${item.id}/readme`);
      if (res.ok) {
        const data = await res.json();
        setReadmeContent(data.readme || 'No README content found.');
      } else {
        setReadmeContent('Error loading README.');
      }
    } catch (e) {
      setReadmeContent('Error loading README.');
    } finally {
      setLoadingReadme(false);
    }
  };

  const handleRun = async () => {
    if (!runningItem) return;
    setIsRunning(true);
    setRunOutput(null);
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: runningItem.id, action: runAction }),
      });
      const data = await res.json();
      setRunOutput(data);
    } catch (e) {
      setRunOutput({
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'Network error occurred while calling run endpoint.',
        error: 'Execution failed',
      });
    } finally {
      setIsRunning(false);
      // Fetch updated stats
      try {
        const statsRes = await fetch('/api/stats');
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
        (item.tags && item.tags.some((t) => t.toLowerCase() === selectedTag.toLowerCase()));

      return matchesSearch && matchesTag;
    });
  }, [oneShots, searchQuery, selectedTag]);

  const total = statsData.totalRuns || 0;
  const failed = statsData.failedRuns || 0;
  const successRate = total > 0 ? Math.round(((total - failed) / total) * 100) : 100;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-800 p-6 flex flex-col border-r border-slate-700">
        <div className="flex items-center space-x-2 mb-8">
          <span className="text-xl font-bold tracking-wide text-blue-400">OneShotForge</span>
        </div>

        <nav className="flex-1 space-y-4">
          <div className="text-sm font-semibold uppercase text-slate-500 tracking-wider">
            Navigation
          </div>
          <button
            onClick={() => handleTabChange('dashboard')}
            className={`flex items-center space-x-2 w-full text-left px-3 py-2 rounded transition-colors ${
              activeTab === 'dashboard'
                ? 'bg-blue-600 text-white font-medium'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <span>Dashboard</span>
          </button>
          <button
            onClick={() => handleTabChange('ideas')}
            className={`flex items-center space-x-2 w-full text-left px-3 py-2 rounded transition-colors ${
              activeTab === 'ideas'
                ? 'bg-blue-600 text-white font-medium'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <span>Ideas Registry</span>
          </button>
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
            {statsData.pricingDate && (
              <div className="flex justify-between border-t border-slate-700/50 pt-2 text-xs text-slate-400">
                <span>Price Registry:</span>
                <span className="font-mono text-amber-400">{statsData.pricingDate}</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8">
        {addIdeaSuccess && (
          <div className="mb-6 p-4 bg-green-900/50 border border-green-500 rounded text-green-200 text-sm flex justify-between items-center">
            <span>{addIdeaSuccess}</span>
            <button
              onClick={() => setAddIdeaSuccess('')}
              className="text-green-200 hover:text-white font-semibold"
            >
              ✕
            </button>
          </div>
        )}

        {activeTab === 'ideas' ? (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-white font-sans">
                  Ideas Registry
                </h1>
                <p className="text-slate-400 mt-1">
                  Explore, search, and manage standalone one-shot application ideas.
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  id="add-idea-btn"
                  onClick={() => setShowAddIdeaModal(true)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition-colors text-sm"
                >
                  Add Idea
                </button>
                <button
                  id="refresh-ideas-btn"
                  onClick={fetchIdeas}
                  disabled={loadingIdeas}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors text-sm"
                >
                  {loadingIdeas ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>

            {/* Search & Filter Row */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="w-full md:w-1/3">
                <input
                  type="text"
                  placeholder="Search ideas..."
                  value={ideasSearchQuery}
                  onChange={(e) => setIdeasSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                />
              </div>
              <div className="w-full md:w-auto flex flex-col md:flex-row gap-3">
                <select
                  value={selectedIdeaCategory}
                  onChange={(e) => setSelectedIdeaCategory(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="">All Categories</option>
                  {IDEAS_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedIdeaStack}
                  onChange={(e) => setSelectedIdeaStack(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="">All Stacks</option>
                  {allIdeaStacks.map((stack) => (
                    <option key={stack} value={stack}>
                      {stack}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedIdeaStatus}
                  onChange={(e) => setSelectedIdeaStatus(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="">All Statuses</option>
                  <option value="backlog">Backlog</option>
                  <option value="promoted">Promoted</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            {/* Ideas Grid */}
            {filteredIdeas.length === 0 ? (
              <div className="text-center py-12 bg-slate-800/50 border border-slate-800 rounded-lg">
                <p className="text-slate-400">
                  {loadingIdeas ? 'Loading ideas...' : 'No ideas found matching your filters.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredIdeas.map((idea) => (
                  <div
                    key={idea.id}
                    className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition-colors flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-blue-400">
                            {idea.id}
                          </span>
                          <span
                            className="text-xs bg-blue-955 text-blue-300 border border-blue-800 px-2 py-0.5 rounded-full font-semibold max-w-[150px] truncate"
                            title={idea.category}
                          >
                            {idea.category}
                          </span>
                        </div>
                        {idea.status === 'promoted' ? (
                          <span className="text-xs bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                            Promoted
                          </span>
                        ) : (
                          <span className="text-xs bg-slate-900 text-slate-400 border border-slate-750 px-2 py-0.5 rounded-full font-semibold capitalize">
                            {idea.status}
                          </span>
                        )}
                      </div>
                      <h3
                        onClick={() => setSelectedIdeaDetail(idea)}
                        className="text-lg font-bold text-slate-100 cursor-pointer hover:text-blue-300 transition-colors mt-2"
                      >
                        {idea.title}
                      </h3>
                      <p className="text-slate-400 text-sm mt-2 line-clamp-3">{idea.vision}</p>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-2">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Stack:</span>
                        <span className="font-mono text-slate-300">{idea.targetStack}</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Added:</span>
                        <span className="font-mono text-slate-300">{idea.dateAdded}</span>
                      </div>
                      <button
                        onClick={() => setSelectedIdeaDetail(idea)}
                        className="w-full mt-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-sm font-medium rounded transition-colors text-center text-white"
                      >
                        View Specifications
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-white font-sans">
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
              className={`${scanError ? '' : 'hidden'} mb-6 p-4 bg-red-900/50 border border-red-500 rounded text-red-200`}
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
                <span className="text-sm text-slate-400 whitespace-nowrap">Filter Tags:</span>
                <button
                  onClick={() => setSelectedTag('')}
                  className={`px-3 py-1 text-xs rounded transition-colors border ${
                    selectedTag === ''
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
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
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
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
                <p className="text-slate-400">No one-shots found matching your filters.</p>
              </div>
            ) : null}

            <div
              className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${filteredItems.length === 0 ? 'hidden' : ''}`}
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
                    <p className="text-slate-400 text-sm mt-2 line-clamp-3">{item.description}</p>
                  </div>

                  <div className="mt-4">
                    <CardMetrics manifest={item.manifest} />

                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {Array.isArray(item.tags) &&
                        item.tags.map((tag) => (
                          <span
                            key={tag}
                            onClick={() => setSelectedTag(tag)}
                            className="text-xs bg-blue-955 text-blue-300 border border-blue-800 px-2 py-0.5 rounded cursor-pointer hover:bg-blue-900 transition-colors"
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
                          setRunAction('test');
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
          </>
        )}
      </main>

      {/* Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-slate-700 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-100">{previewItem.name} - README</h2>
                <p className="text-xs text-slate-400 mt-1">{previewItem.path}</p>
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
                  <span className="text-slate-400">Loading README content...</span>
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
                <h2 className="text-xl font-bold text-slate-100">Run: {runningItem.name}</h2>
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
                <span className="text-sm font-semibold text-slate-300">Select Script Target:</span>
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
                  {isRunning ? 'Executing...' : 'Run'}
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
                      &gt; Executing script target &quot;{runAction}&quot;... Please wait.
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

      {/* Detail Modal */}
      {selectedIdeaDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-slate-700 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-sm font-bold text-blue-400 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded">
                    {selectedIdeaDetail.id}
                  </span>
                  <h2 className="text-xl font-bold text-slate-100">{selectedIdeaDetail.title}</h2>
                  {selectedIdeaDetail.status === 'promoted' ? (
                    <span className="text-xs bg-emerald-955 text-emerald-300 border border-emerald-800 px-2.5 py-0.5 rounded-full font-semibold">
                      Promoted
                    </span>
                  ) : (
                    <span className="text-xs bg-slate-900 text-slate-400 border border-slate-750 px-2.5 py-0.5 rounded-full font-semibold capitalize">
                      {selectedIdeaDetail.status}
                    </span>
                  )}
                </div>
                <p className="text-xs text-blue-400 mt-1.5">
                  Category: {selectedIdeaDetail.category}
                </p>
              </div>
              <button
                onClick={() => setSelectedIdeaDetail(null)}
                className="text-slate-400 hover:text-white text-lg font-semibold"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-slate-300 text-sm">
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Core Vision
                </h3>
                <p className="mt-1 bg-slate-900/50 p-3 border border-slate-700/50 rounded whitespace-pre-wrap">
                  {selectedIdeaDetail.vision}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Technical Specifications
                </h3>
                <p className="mt-1 bg-slate-900/50 p-3 border border-slate-700/50 rounded whitespace-pre-wrap">
                  {selectedIdeaDetail.techSpecs}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Target Language / Stack
                  </h3>
                  <p className="mt-1 bg-slate-900/50 p-2 border border-slate-700/50 rounded font-mono text-xs">
                    {selectedIdeaDetail.targetStack}
                  </p>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Date Added
                  </h3>
                  <p className="mt-1 bg-slate-900/50 p-2 border border-slate-700/50 rounded font-mono text-xs">
                    {selectedIdeaDetail.dateAdded}
                  </p>
                </div>
              </div>

              {selectedIdeaDetail.status === 'promoted' && selectedIdeaDetail.promoted_to && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Promoted To
                  </h3>
                  <div className="mt-1">
                    <a
                      href={`#${selectedIdeaDetail.promoted_to}`}
                      onClick={() => {
                        setActiveTab('dashboard');
                        setSearchQuery(selectedIdeaDetail.promoted_to);
                        setSelectedIdeaDetail(null);
                      }}
                      className="inline-block px-3 py-1.5 bg-emerald-955 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 rounded font-mono text-xs transition-colors"
                    >
                      /one-shots/{selectedIdeaDetail.promoted_to}
                    </a>
                  </div>
                </div>
              )}

              {Object.keys(promptVariables).length > 0 && (
                <div className="bg-slate-900/50 p-4 border border-slate-700/50 rounded space-y-3">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Customize Prompt Variables
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.entries(promptVariables).map(([key, val]) => (
                      <div key={key} className="flex flex-col gap-1">
                        <label className="text-xs text-slate-400 font-mono">
                          {key}
                        </label>
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => {
                            setPromptVariables((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }));
                          }}
                          className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Standardized Task Prompt
                  </h3>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(compiledPrompt);
                      alert('Prompt copied to clipboard!');
                    }}
                    className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded flex items-center gap-1 transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <pre className="p-3 bg-black rounded font-mono text-xs text-green-400 overflow-x-auto whitespace-pre-wrap max-h-48 border border-slate-900">
                  {compiledPrompt}
                </pre>
              </div>
            </div>
            <div className="p-4 border-t border-slate-700 flex justify-end gap-3">
              {selectedIdeaDetail.status !== 'promoted' && (
                <button
                  onClick={() => handlePromoteIdea(selectedIdeaDetail)}
                  disabled={promotingIdeaId === selectedIdeaDetail.id}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded font-medium transition-colors"
                >
                  {promotingIdeaId === selectedIdeaDetail.id ? 'Promoting...' : 'Promote to One-Shot'}
                </button>
              )}
              <button
                onClick={() => setSelectedIdeaDetail(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Idea Modal */}
      {showAddIdeaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-slate-700 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-100">Add New Idea</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Submit a new standalone one-shot application idea to the registry.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAddIdeaModal(false);
                  setAddIdeaError('');
                }}
                className="text-slate-400 hover:text-white text-lg font-semibold"
                disabled={submittingIdea}
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {addIdeaError && (
                <div className="p-3 bg-red-900/50 border border-red-500 rounded text-red-200 text-sm">
                  {addIdeaError}
                </div>
              )}

              <div className="flex flex-col space-y-1">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                  Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. My Awesome Scraper"
                  value={addIdeaForm.title}
                  onChange={(e) => setAddIdeaForm({ ...addIdeaForm, title: e.target.value })}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                  disabled={submittingIdea}
                />
              </div>

              <div className="flex flex-col space-y-1">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                  Category
                </label>
                <select
                  value={addIdeaForm.category}
                  onChange={(e) => setAddIdeaForm({ ...addIdeaForm, category: e.target.value })}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-100 focus:outline-none focus:border-blue-500 text-sm"
                  disabled={submittingIdea}
                >
                  <option value="">Select Category</option>
                  {IDEAS_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col space-y-1">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                  Core Vision
                </label>
                <textarea
                  placeholder="What does this one-shot build and why?"
                  value={addIdeaForm.vision}
                  onChange={(e) => setAddIdeaForm({ ...addIdeaForm, vision: e.target.value })}
                  rows={3}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                  disabled={submittingIdea}
                />
              </div>

              <div className="flex flex-col space-y-1">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                  Technical Specifications
                </label>
                <textarea
                  placeholder="Provide technical library usage details, constraints..."
                  value={addIdeaForm.techSpecs}
                  onChange={(e) =>
                    setAddIdeaForm({
                      ...addIdeaForm,
                      techSpecs: e.target.value,
                    })
                  }
                  rows={3}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                  disabled={submittingIdea}
                />
              </div>

              <div className="flex flex-col space-y-1">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                  Target Language / Stack
                </label>
                <input
                  type="text"
                  placeholder="e.g. Python, SQLite, Playwright"
                  value={addIdeaForm.targetStack}
                  onChange={(e) =>
                    setAddIdeaForm({
                      ...addIdeaForm,
                      targetStack: e.target.value,
                    })
                  }
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                  disabled={submittingIdea}
                />
              </div>

              <div className="flex flex-col space-y-1">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                  Task Prompt
                </label>
                <textarea
                  placeholder="The standardized instructions given to an agent to build the application."
                  value={addIdeaForm.readyToCopyTaskPrompt}
                  onChange={(e) =>
                    setAddIdeaForm({
                      ...addIdeaForm,
                      readyToCopyTaskPrompt: e.target.value,
                    })
                  }
                  rows={4}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                  disabled={submittingIdea}
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-700 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddIdeaModal(false);
                  setAddIdeaError('');
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium transition-colors text-sm"
                disabled={submittingIdea}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setAddIdeaError('');
                  if (
                    !addIdeaForm.title.trim() ||
                    !addIdeaForm.category.trim() ||
                    !addIdeaForm.vision.trim() ||
                    !addIdeaForm.techSpecs.trim() ||
                    !addIdeaForm.targetStack.trim() ||
                    !addIdeaForm.readyToCopyTaskPrompt.trim()
                  ) {
                    setAddIdeaError('All fields are required.');
                    return;
                  }

                  const invalidPatterns = [
                    '/',
                    '\\',
                    '..',
                    '__proto__',
                    'constructor',
                    'prototype',
                  ];
                  for (const pattern of invalidPatterns) {
                    if (addIdeaForm.title.includes(pattern)) {
                      setAddIdeaError(
                        `Title cannot contain "${pattern}" due to directory security policies.`
                      );
                      return;
                    }
                    if (addIdeaForm.category.includes(pattern)) {
                      setAddIdeaError(
                        `Category cannot contain "${pattern}" due to directory security policies.`
                      );
                      return;
                    }
                  }

                  setSubmittingIdea(true);
                  try {
                    const res = await fetch('/api/ideas', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(addIdeaForm),
                    });
                    if (res.ok) {
                      const newIdea = await res.json();
                      setAddIdeaSuccess(`Successfully added idea "${newIdea.title}"!`);
                      setAddIdeaForm({
                        title: '',
                        category: '',
                        vision: '',
                        techSpecs: '',
                        targetStack: '',
                        readyToCopyTaskPrompt: '',
                      });
                      setShowAddIdeaModal(false);
                      await fetchIdeas();
                      setTimeout(() => setAddIdeaSuccess(''), 5000);
                    } else {
                      const errData = await res.json();
                      setAddIdeaError(errData.error || 'Failed to submit new idea.');
                    }
                  } catch (e) {
                    setAddIdeaError('Network error while submitting idea.');
                  } finally {
                    setSubmittingIdea(false);
                  }
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium transition-colors text-sm flex items-center space-x-1"
                disabled={submittingIdea}
              >
                <span>{submittingIdea ? 'Submitting...' : 'Submit'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
