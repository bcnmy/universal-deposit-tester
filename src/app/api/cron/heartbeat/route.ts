/**
 * GET /api/cron/heartbeat
 *
 * Lightweight endpoint that returns the timestamp of the last cron poll.
 * Used by the frontend to display a countdown to the next sweep.
 */

import { NextResponse } from "next/server";
import { getLastCronHeartbeat } from "@/lib/cronHeartbeat";

export async function GET() {
  const lastPoll = getLastCronHeartbeat();
  return NextResponse.json({ lastPollAt: lastPoll });
}
