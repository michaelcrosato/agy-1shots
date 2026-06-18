import fs from 'fs';
import path from 'path';
import { getStats } from '../lib/stats';
import { readManifestSyncWithStatus, summarizeManifest } from '../lib/manifest';
import { getPricingDate } from '../lib/pricing';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const oneShotsDir = path.resolve(process.cwd(), '../one-shots');
  let items = [];
  let scanError = false;

  try {
    if (fs.existsSync(oneShotsDir)) {
      const files = fs.readdirSync(oneShotsDir);
      for (const file of files) {
        const fullPath = path.join(oneShotsDir, file);
        try {
          let isDir = false;
          try {
            isDir = fs.statSync(fullPath).isDirectory();
          } catch (e) {
            continue;
          }
          if (isDir) {
            const pkgPath = path.join(fullPath, 'package.json');
            let pkgExists = false;
            try {
              pkgExists = fs.existsSync(pkgPath);
            } catch (err) {
              pkgExists = false;
            }

            if (pkgExists) {
              let pkg = {};
              try {
                pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                if (pkg === null || typeof pkg !== 'object') {
                  pkg = {};
                }
              } catch (e) {
                // Handle corrupt package.json gracefully
              }

              const name = typeof pkg.name === 'string' ? pkg.name : file;
              const version = typeof pkg.version === 'string' ? pkg.version : '1.0.0';
              const description = typeof pkg.description === 'string' ? pkg.description : '';
              const tags = Array.isArray(pkg.tags)
                ? pkg.tags.filter((t) => typeof t === 'string')
                : [];

              const { manifest: parsedManifest, status: manifestStatus } =
                readManifestSyncWithStatus(fullPath);
              const manifest = summarizeManifest(parsedManifest, manifestStatus);

              items.push({
                id: file,
                name,
                version,
                description,
                tags,
                path: fullPath,
                manifest,
              });
            }
          }
        } catch (e) {
          // Gracefully skip directory if nested read throws
        }
      }
    }
  } catch (err) {
    scanError = true;
  }

  // Sort alphabetically by name ascending
  items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const statsData = await getStats();
  const total = statsData.totalRuns || 0;
  const failed = statsData.failedRuns || 0;
  const pricingDate = getPricingDate();

  return (
    <DashboardClient
      initialItems={items}
      initialStats={{ totalRuns: total, failedRuns: failed, pricingDate }}
      initialScanError={scanError}
    />
  );
}
