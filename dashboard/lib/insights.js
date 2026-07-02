import fs from 'fs';
import path from 'path';
import { readManifestSync, decorateAttempt } from './manifest.js';

// Cross-one-shot aggregation for the teaching layer: per-model profiles, a
// model × one-shot scoreboard, and a lessons feed. Pure over its input so it
// is unit-testable; collectPieces() is the one filesystem entry point.
//
// Integrity rule (matches the repo's evidence philosophy): quantitative
// averages — tokens, duration, cost — are computed over benchmark-eligible
// attempts ONLY. Qualitative signals (fidelity, one-shot rate, observations)
// are human/machine judgments and are aggregated wherever present.

export function collectPieces(oneShotsDir) {
  let entries = [];
  try {
    entries = fs.readdirSync(oneShotsDir, { withFileTypes: true });
  } catch (e) {
    return [];
  }
  const pieces = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(oneShotsDir, e.name);
    try {
      if (!fs.existsSync(path.join(dir, 'package.json'))) continue;
    } catch (err) {
      continue;
    }
    const manifest = readManifestSync(dir);
    pieces.push({
      id: e.name,
      manifest: {
        ...manifest,
        attempts: (manifest.attempts || []).map(decorateAttempt),
      },
    });
  }
  return pieces;
}

function avg(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

const STATUS_RANK = { attempted: 1, fail: 2, scored: 3, pass: 4 };

function newProfile(model) {
  return {
    model,
    attempts: 0,
    interactionCount: 0,
    oneShotCount: 0,
    evaluated: 0,
    fidelities: [],
    verifyRuns: 0,
    verifyPasses: 0,
    eligible: 0,
    tokens: [],
    durations: [],
    costs: [],
    struggles: [],
  };
}

export function buildInsights(pieces) {
  const profiles = new Map();
  const matrix = [];
  const lessons = [];
  let attemptsTotal = 0;
  let eligibleTotal = 0;
  let withInteraction = 0;
  let withObservations = 0;

  for (const piece of pieces) {
    const attempts = (piece.manifest && piece.manifest.attempts) || [];
    const cells = {};

    for (const a of attempts) {
      attemptsTotal += 1;
      const model =
        typeof a.model === 'string' && a.model.trim() ? a.model.trim() : '(unknown model)';
      const p = profiles.get(model) || newProfile(model);
      p.attempts += 1;

      const inter = a.interaction;
      const hasInteraction = !!(inter && typeof inter.userPrompts === 'number');
      if (hasInteraction) {
        p.interactionCount += 1;
        withInteraction += 1;
        if (inter.oneShot === true) p.oneShotCount += 1;
      }

      const ev = a.evaluation || {};
      const hasFidelity = typeof ev.fidelityScore === 'number';
      const hasVerify = ev.method === 'program' && typeof ev.passed === 'boolean';
      if (hasFidelity || hasVerify) p.evaluated += 1;
      if (hasFidelity) p.fidelities.push(ev.fidelityScore);
      if (hasVerify) {
        p.verifyRuns += 1;
        if (ev.passed) p.verifyPasses += 1;
      }

      if (a.benchmarkEligible) {
        p.eligible += 1;
        eligibleTotal += 1;
        if (a.build && typeof a.build.tokens === 'number') p.tokens.push(a.build.tokens);
        if (a.build && typeof a.build.durationMs === 'number') p.durations.push(a.build.durationMs);
        if (typeof a.estimatedCost === 'number') p.costs.push(a.estimatedCost);
      }

      const obs = a.observations;
      if (obs && typeof obs === 'object') {
        withObservations += 1;
        for (const text of Array.isArray(obs.struggled) ? obs.struggled : []) {
          p.struggles.push({ text, timestamp: a.timestamp || null });
        }
        for (const text of Array.isArray(obs.lessons) ? obs.lessons : []) {
          lessons.push({ oneShotId: piece.id, model, timestamp: a.timestamp || null, text });
        }
      }
      profiles.set(model, p);

      // --- matrix cell: keep the best outcome seen for (one-shot, model) ---
      const cell =
        cells[model] ||
        (cells[model] = {
          attempts: 0,
          status: 'attempted',
          fidelity: null,
          oneShot: null,
          userPrompts: null,
        });
      cell.attempts += 1;
      if (hasInteraction) {
        cell.oneShot = cell.oneShot === true ? true : inter.oneShot === true;
        cell.userPrompts =
          cell.userPrompts === null
            ? inter.userPrompts
            : Math.min(cell.userPrompts, inter.userPrompts);
      }
      if (hasFidelity && (cell.fidelity === null || ev.fidelityScore > cell.fidelity)) {
        cell.fidelity = ev.fidelityScore;
      }
      let status = 'attempted';
      if (hasVerify) status = ev.passed ? 'pass' : 'fail';
      else if (hasFidelity) status = 'scored';
      if (STATUS_RANK[status] > STATUS_RANK[cell.status]) cell.status = status;
    }

    matrix.push({ oneShotId: piece.id, cells });
  }

  const models = [...profiles.values()]
    .map((p) => ({
      model: p.model,
      attempts: p.attempts,
      interactionCount: p.interactionCount,
      oneShotCount: p.oneShotCount,
      oneShotRate: p.interactionCount > 0 ? p.oneShotCount / p.interactionCount : null,
      evaluated: p.evaluated,
      avgFidelity: avg(p.fidelities),
      verifyRuns: p.verifyRuns,
      verifyPasses: p.verifyPasses,
      benchmarkEligibleAttempts: p.eligible,
      excludedFromAverages: p.attempts - p.eligible,
      avgTokens: avg(p.tokens),
      avgDurationMs: avg(p.durations),
      avgCostUsd: avg(p.costs),
      topStruggles: p.struggles
        .slice()
        .sort((x, y) => String(y.timestamp || '').localeCompare(String(x.timestamp || '')))
        .slice(0, 5)
        .map((s) => s.text),
    }))
    .sort((a, b) => b.attempts - a.attempts || a.model.localeCompare(b.model));

  lessons.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));

  return {
    totals: {
      oneShots: pieces.length,
      attempts: attemptsTotal,
      models: models.length,
      benchmarkEligible: eligibleTotal,
      withInteraction,
      withObservations,
    },
    models,
    matrix,
    lessons,
  };
}
