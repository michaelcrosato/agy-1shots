import { promises as fs } from 'fs';
import path from 'path';

const statsPath = path.join(process.cwd(), 'stats.json');

export async function getStats() {
  try {
    const data = await fs.readFile(statsPath, 'utf8');
    const parsed = JSON.parse(data);
    return {
      totalRuns: typeof parsed.totalRuns === 'number' ? parsed.totalRuns : 0,
      failedRuns: typeof parsed.failedRuns === 'number' ? parsed.failedRuns : 0,
    };
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('Error reading stats:', e);
    }
  }
  return { totalRuns: 0, failedRuns: 0 };
}

async function writeStats(data) {
  const uniqueTmpPath = path.join(
    process.cwd(),
    `stats.json.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).substring(2)}`
  );
  let created = false;
  try {
    await fs.writeFile(uniqueTmpPath, JSON.stringify(data, null, 2), 'utf8');
    created = true;

    // Retry loop (5 attempts with 50ms delay)
    let attempts = 5;
    while (attempts > 0) {
      try {
        await fs.rename(uniqueTmpPath, statsPath);
        break;
      } catch (err) {
        attempts--;
        if (attempts === 0) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  } catch (e) {
    console.error('Error writing stats:', e);
    if (created) {
      try {
        await fs.unlink(uniqueTmpPath);
      } catch (unlinkErr) {
        if (unlinkErr.code !== 'ENOENT') {
          console.error('Error cleaning up temp file:', unlinkErr);
        }
      }
    }
    throw e;
  }
}

let updateQueue = Promise.resolve();

async function runInQueue(fn) {
  const next = updateQueue.then(fn);
  updateQueue = next.catch(() => {});
  return next;
}

export async function incrementTotalRuns() {
  return runInQueue(async () => {
    const data = await getStats();
    data.totalRuns += 1;
    await writeStats(data);
  });
}

export async function incrementFailedRuns() {
  return runInQueue(async () => {
    const data = await getStats();
    data.failedRuns += 1;
    await writeStats(data);
  });
}
