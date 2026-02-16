/**
 * GET /api/cron/poll
 *
 * Vercel Cron handler — polls balances for all registered wallets and
 * triggers bridges/forwards when deposits are detected.
 *
 * Protected by CRON_SECRET so it can't be called by random visitors.
 *
 * Schedule: every 1 minute (configured in vercel.json).
 * On the Pro plan the function can run for up to 60 s, which is enough
 * to iterate through all registered wallets sequentially.
 */

import { NextResponse } from "next/server";
import { pollAllSessions } from "@/lib/pollAndBridge";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { c } from "@/lib/log";

export const maxDuration = 60; // seconds (Vercel Pro)

export async function GET(request: Request) {
  // ── Auth gate ──────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn(c.boldRed(`  ⛔ Cron: unauthorized request`));
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Run the poll (all logging is handled by pollAllSessions) ───────
  try {
    recordCronHeartbeat();
    const result = await pollAllSessions();
    return NextResponse.json(result);
  } catch (err) {
    console.error(
      c.boldRed(`  ⛔ Cron: fatal error —`),
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
