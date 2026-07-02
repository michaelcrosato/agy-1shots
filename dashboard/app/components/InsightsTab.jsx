'use client';

import React, { useEffect, useState } from 'react';

// The teaching view: what the recorded attempts say each model can and cannot
// one-shot. Everything here is derived from oneshot.json manifests via
// /api/insights — nothing is hand-maintained.

const GLOSSARY = {
  'one-shot': 'Built correctly from a single prompt, with no human corrections.',
  token: 'The unit models read/write text in (~¾ of a word). Measures work and cost.',
  fidelity: 'Human score (0–100%) of how closely the result matches the written vision.',
  'benchmark-eligible':
    'Attempt whose token/time telemetry came from a trusted, machine-observed source. Only these are averaged.',
  prompts: 'Human messages the build session needed — counted from the session transcript.',
};

function Term({ k, children }) {
  return (
    <span
      className="underline decoration-dotted decoration-slate-500 cursor-help"
      title={GLOSSARY[k]}
    >
      {children}
    </span>
  );
}

function pct(rate) {
  return `${Math.round(rate * 100)}%`;
}

function fmtTokens(n) {
  if (typeof n !== 'number') return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}

function fmtMs(ms) {
  if (typeof ms !== 'number') return '—';
  const mins = ms / 60000;
  if (mins >= 60) return `${(mins / 60).toFixed(1)} h`;
  if (mins >= 1) return `${mins.toFixed(1)} min`;
  return `${Math.round(ms / 1000)} s`;
}

function cellBadge(cell) {
  if (!cell) return <span className="text-slate-600">—</span>;
  const prompts =
    typeof cell.userPrompts === 'number'
      ? ` · ${cell.userPrompts} prompt${cell.userPrompts === 1 ? '' : 's'}`
      : '';
  switch (cell.status) {
    case 'pass':
      return <span className="text-green-400">✅ verified{prompts}</span>;
    case 'fail':
      return <span className="text-red-400">❌ failed verify{prompts}</span>;
    case 'scored':
      return (
        <span className="text-amber-300">
          {cell.fidelity}% fidelity{prompts}
        </span>
      );
    default:
      return <span className="text-slate-400">🔸 attempted{prompts}</span>;
  }
}

export default function InsightsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/insights');
        const json = await res.json();
        if (!cancelled) {
          if (res.ok) setData(json);
          else setError(json.error || 'Failed to load insights.');
        }
      } catch (e) {
        if (!cancelled) setError('Network error loading insights.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="text-slate-400">Loading insights…</div>;
  if (error) return <div className="text-red-400">{error}</div>;
  if (!data) return null;

  const { totals, models, matrix, lessons } = data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Insights</h1>
        <p className="text-slate-400 mt-2 max-w-3xl">
          What the recorded attempts say each model can — and cannot —{' '}
          <Term k="one-shot">one-shot</Term>. Every number below is machine-observed from build
          sessions or human-scored against each project’s written vision; the model is never asked
          to report its own numbers.
        </p>
        <p className="text-slate-500 text-sm mt-2">
          {totals.oneShots} one-shots · {totals.attempts} attempts · {totals.models} models ·{' '}
          {totals.benchmarkEligible} <Term k="benchmark-eligible">benchmark-eligible</Term>
        </p>
      </div>

      {totals.attempts === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 text-slate-300 max-w-3xl">
          <div className="font-semibold text-white mb-2">No attempts recorded yet</div>
          <p className="text-sm">
            Build a one-shot with any AI coding tool, then record it with{' '}
            <code className="text-amber-300">
              node scripts/record-build.js --id &lt;one-shot&gt;
            </code>
            . Attempts, evaluations, and observations will show up here automatically.
          </p>
        </div>
      ) : (
        <>
          <section>
            <h2 className="text-xl font-bold text-white mb-3">Scoreboard — one-shot × model</h2>
            <div className="overflow-x-auto bg-slate-800 border border-slate-700 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="py-2 px-3">One-shot</th>
                    {models.map((m) => (
                      <th key={m.model} className="py-2 px-3">
                        {m.model}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row) => (
                    <tr key={row.oneShotId} className="border-b border-slate-700/50">
                      <td className="py-2 px-3 font-mono text-slate-200">{row.oneShotId}</td>
                      {models.map((m) => (
                        <td key={m.model} className="py-2 px-3">
                          {cellBadge(row.cells[m.model])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Model profiles</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {models.map((m) => (
                <div key={m.model} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                  <div className="font-semibold text-white">{m.model}</div>
                  <dl className="mt-2 text-sm text-slate-300 space-y-1">
                    <div className="flex justify-between">
                      <dt>Attempts</dt>
                      <dd>
                        {m.attempts}{' '}
                        <span className="text-slate-500">
                          ({m.benchmarkEligibleAttempts} eligible)
                        </span>
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>
                        <Term k="one-shot">One-shot rate</Term>
                      </dt>
                      <dd>
                        {m.oneShotRate === null
                          ? '—'
                          : `${pct(m.oneShotRate)} (${m.oneShotCount}/${m.interactionCount})`}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>
                        Avg <Term k="fidelity">fidelity</Term>
                      </dt>
                      <dd>{m.avgFidelity === null ? '—' : `${Math.round(m.avgFidelity)}%`}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Acceptance tests</dt>
                      <dd>
                        {m.verifyRuns === 0 ? '—' : `${m.verifyPasses}/${m.verifyRuns} passed`}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>
                        Avg build (<Term k="benchmark-eligible">trusted only</Term>)
                      </dt>
                      <dd>
                        {fmtTokens(m.avgTokens)} tok · {fmtMs(m.avgDurationMs)} ·{' '}
                        {typeof m.avgCostUsd === 'number' ? `$${m.avgCostUsd.toFixed(2)}` : '—'}
                      </dd>
                    </div>
                  </dl>
                  {m.topStruggles.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                        Recent struggles
                      </div>
                      <ul className="text-sm text-red-300/90 list-disc list-inside space-y-0.5">
                        {m.topStruggles.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Lessons learned</h2>
            {lessons.length === 0 ? (
              <p className="text-slate-400 text-sm max-w-3xl">
                No lessons recorded yet. After evaluating an attempt, add observations in its
                Details panel — what went well, what the model struggled with, and the takeaway.
              </p>
            ) : (
              <ul className="space-y-2 max-w-3xl">
                {lessons.map((l, i) => (
                  <li key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                    <div className="text-slate-100">{l.text}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {l.model} on <span className="font-mono">{l.oneShotId}</span>
                      {l.timestamp ? ` · ${String(l.timestamp).slice(0, 10)}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
