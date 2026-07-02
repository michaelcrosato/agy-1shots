// Unit tests for the insights aggregation + LESSONS.md renderer.
// Run from the dashboard dir: node lib/insights.test.mjs
import assert from 'node:assert';
import { buildInsights } from './insights.js';
import { renderLessonsMarkdown } from './lessons-md.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  PASS ${name}`);
}

function att(over = {}) {
  return {
    id: `att_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: '2026-06-20T10:00:00.000Z',
    model: 'model-a',
    build: { tokens: 1000, durationMs: 60000 },
    estimatedCost: 0.5,
    benchmarkEligible: true,
    evaluation: { method: 'none', fidelityScore: null, passed: null, feedback: '' },
    ...over,
  };
}

const pieces = [
  {
    id: 'alpha',
    manifest: {
      attempts: [
        att({
          interaction: { userPrompts: 1, oneShot: true, source: 'transcript' },
          evaluation: { method: 'program', fidelityScore: null, passed: true, feedback: '' },
          observations: {
            wentWell: ['clean scaffold'],
            struggled: ['flaky shader math'],
            lessons: ['model-a one-shots scaffolding'],
            notedAt: '2026-06-20T11:00:00.000Z',
          },
        }),
        att({
          model: 'model-b',
          timestamp: '2026-06-21T10:00:00.000Z',
          benchmarkEligible: false,
          estimatedCost: null,
          build: { tokens: 999999, durationMs: 1 },
          interaction: { userPrompts: 4, oneShot: false, source: 'transcript' },
          evaluation: { method: 'human', fidelityScore: 70, passed: null, feedback: '' },
          observations: {
            wentWell: [],
            struggled: ['lost the plot on state management'],
            lessons: ['model-b needs a plan first'],
            notedAt: '2026-06-21T11:00:00.000Z',
          },
        }),
      ],
    },
  },
  { id: 'beta', manifest: { attempts: [att({ model: 'model-a', timestamp: null })] } },
];

const insights = buildInsights(pieces);

check('totals count pieces, attempts, models, eligibility, learning coverage', () => {
  assert.deepStrictEqual(insights.totals, {
    oneShots: 2,
    attempts: 3,
    models: 2,
    benchmarkEligible: 2,
    withInteraction: 2,
    withObservations: 2,
  });
});

check('model profiles aggregate correctly and only trusted telemetry averages', () => {
  const a = insights.models.find((m) => m.model === 'model-a');
  assert.strictEqual(a.attempts, 2);
  assert.strictEqual(a.oneShotRate, 1); // 1 of 1 attempts with interaction data
  assert.strictEqual(a.interactionCount, 1);
  assert.strictEqual(a.verifyPasses, 1);
  assert.strictEqual(a.avgTokens, 1000);
  const b = insights.models.find((m) => m.model === 'model-b');
  assert.strictEqual(b.oneShotRate, 0);
  assert.strictEqual(b.avgFidelity, 70);
  // model-b's only attempt is NOT benchmark-eligible: no quantitative averages.
  assert.strictEqual(b.avgTokens, null);
  assert.strictEqual(b.avgCostUsd, null);
  assert.strictEqual(b.excludedFromAverages, 1);
  assert.deepStrictEqual(b.topStruggles, ['lost the plot on state management']);
});

check('matrix picks the best outcome per (one-shot, model)', () => {
  const alpha = insights.matrix.find((r) => r.oneShotId === 'alpha');
  assert.strictEqual(alpha.cells['model-a'].status, 'pass');
  assert.strictEqual(alpha.cells['model-a'].oneShot, true);
  assert.strictEqual(alpha.cells['model-b'].status, 'scored');
  assert.strictEqual(alpha.cells['model-b'].fidelity, 70);
  assert.strictEqual(alpha.cells['model-b'].userPrompts, 4);
  const beta = insights.matrix.find((r) => r.oneShotId === 'beta');
  assert.strictEqual(beta.cells['model-a'].status, 'attempted');
});

check('lessons feed is attributed and newest first', () => {
  assert.strictEqual(insights.lessons.length, 2);
  assert.strictEqual(insights.lessons[0].text, 'model-b needs a plan first');
  assert.strictEqual(insights.lessons[0].model, 'model-b');
  assert.strictEqual(insights.lessons[1].oneShotId, 'alpha');
});

check('empty input produces zeroed, renderable insights', () => {
  const empty = buildInsights([]);
  assert.strictEqual(empty.totals.attempts, 0);
  assert.deepStrictEqual(empty.models, []);
  assert.deepStrictEqual(empty.lessons, []);
});

check('renderLessonsMarkdown renders data sections', () => {
  const md = renderLessonsMarkdown(insights, { generatedAt: '2026-07-01' });
  assert.ok(md.includes('# What can AI coding tools actually build in one shot?'));
  assert.ok(md.includes('model-b needs a plan first'));
  assert.ok(md.includes('model-a'));
  assert.ok(md.includes('Glossary'));
  assert.ok(md.includes('2026-07-01'));
});

check('renderLessonsMarkdown renders honest empty states', () => {
  const md = renderLessonsMarkdown(buildInsights([]), { generatedAt: '2026-07-01' });
  assert.ok(md.includes('No attempts recorded yet'));
  assert.ok(md.includes('No lessons recorded yet'));
});

console.log(`\ninsights.test.mjs: ALL ${passed} CHECKS PASSED`);
