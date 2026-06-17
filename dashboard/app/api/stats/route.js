import { NextResponse } from "next/server";
import { getStats } from "../../../lib/stats";

export const dynamic = "force-dynamic";

export async function GET() {
  const statsData = await getStats();
  return NextResponse.json({
    totalRuns: statsData.totalRuns,
    failedRuns: statsData.failedRuns,
  });
}
