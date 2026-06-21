import fs from 'fs';
import path from 'path';

/**
 * Write a file atomically (synchronous).
 *
 * `fs.writeFileSync` truncates the target and then streams the new bytes, so a
 * crash (or a concurrent reader) mid-write sees a truncated/torn file. For
 * machine-read files like `registry.json` — whose every reader does
 * `JSON.parse` — a torn write poisons all subsequent reads (they throw and the
 * route 500s) until a human repairs the file.
 *
 * This writes to a unique temp file in the same directory and then `rename`s it
 * over the target. `rename(2)` is atomic on a single filesystem, so after a
 * crash the target is always either the complete old file or the complete new
 * file — never a partial one. (Same pattern as lib/manifest.js `atomicWrite`
 * and lib/stats.js.) The temp name carries pid + time + random so concurrent
 * writers never collide on it.
 *
 * @param {string} filePath absolute path of the file to write
 * @param {string} data the full file contents
 */
export function writeFileAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmpPath = path.join(
    dir,
    `${base}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`
  );

  let created = false;
  try {
    fs.writeFileSync(tmpPath, data, 'utf8');
    created = true;
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    // Best-effort cleanup so a failed write never leaks a temp file. The
    // original error is what the caller needs, so swallow any cleanup error.
    if (created) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    }
    throw err;
  }
}
