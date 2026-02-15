/**
 * GET /api/history/:address
 *
 * Returns bridge history for a wallet address.
 * Query params:
 *   - offset: number (default 0)
 *   - limit:  number (default 50, max 100)
 */

import { NextResponse, type NextRequest } from "next/server";
import { getHistory, getHistoryCount } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;

  if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
    return NextResponse.json(
      { error: "Invalid address" },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));

  try {
    const [entries, total] = await Promise.all([
      getHistory(address, offset, limit),
      getHistoryCount(address),
    ]);

    return NextResponse.json({ entries, total, offset, limit });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
