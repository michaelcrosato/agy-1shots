#!/usr/bin/env node
// Regenerates the repo-root LESSONS.md from all one-shot manifests.
//   node scripts/generate-lessons.mjs
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// pricing.js resolves its CSV from process.cwd() (Next.js always runs with
// cwd = dashboard/), so match that before importing any dashboard lib.
process.chdir(path.join(repoRoot, 'dashboard'));

const { regenerateLessonsFile } = await import(
  pathToFileURL(path.join(repoRoot, 'dashboard', 'lib', 'lessons-file.js')).href
);

const res = regenerateLessonsFile({
  oneShotsDir: path.join(repoRoot, 'one-shots'),
  outPath: path.join(repoRoot, 'LESSONS.md'),
});
if (!res.ok) {
  console.error(`Failed to generate LESSONS.md: ${res.error}`);
  process.exit(1);
}
console.log(`Wrote ${res.outPath}`);
