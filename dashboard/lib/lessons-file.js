import path from 'path';
import { collectPieces, buildInsights } from './insights.js';
import { renderLessonsMarkdown } from './lessons-md.js';
import { writeFileAtomic } from './atomic-file.js';

// Regenerate the repo-root LESSONS.md teaching artifact from every one-shot
// manifest. Defaults assume cwd = dashboard/ (how Next.js and the unit suites
// run); out-of-dashboard callers pass explicit paths or chdir first.
// Never throws: a failed regeneration must not fail the write that caused it.
export function regenerateLessonsFile({ oneShotsDir, outPath } = {}) {
  try {
    const dir = oneShotsDir || path.resolve(process.cwd(), '../one-shots');
    const out = outPath || path.resolve(process.cwd(), '../LESSONS.md');
    const insights = buildInsights(collectPieces(dir));
    const md = renderLessonsMarkdown(insights, {
      generatedAt: new Date().toISOString().slice(0, 10),
    });
    writeFileAtomic(out, md);
    return { ok: true, outPath: out };
  } catch (e) {
    console.error('LESSONS.md regeneration failed:', e.message);
    return { ok: false, error: e.message };
  }
}
