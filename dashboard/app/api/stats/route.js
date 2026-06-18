import { NextResponse } from 'next/server';
import { getStats } from '../../../lib/stats';
import { getPricingDate } from '../../../lib/pricing';

export const dynamic = 'force-dynamic';

export async function GET() {
  const statsData = await getStats();
  return NextResponse.json({
    totalRuns: statsData.totalRuns,
    failedRuns: statsData.failedRuns,
    pricingDate: getPricingDate(),
  });
}
