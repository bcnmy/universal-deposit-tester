/**
 * GET  /api/history/:address — fetch history entries (paginated)
 * POST /api/history/:address — add a new history entry
 *
 * Query params (GET):
 *   - offset: number (default 0)
 *   - limit:  number (default 50, max 100)
 */

import { NextResponse, type NextRequest } from "next/server";
import { getHistory, getHistoryCount, addHistoryEntry, type HistoryEntry } from "@/lib/db";

const VALID_TYPES = ["bridge", "forward", "sweep"] as const;
const VALID_STATUSES = ["success", "error"] as const;

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

export async function POST(
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const entry = body as Record<string, unknown>;

  // Validate required fields
  if (
    !entry ||
    typeof entry.type !== "string" ||
    !VALID_TYPES.includes(entry.type as (typeof VALID_TYPES)[number]) ||
    typeof entry.status !== "string" ||
    !VALID_STATUSES.includes(entry.status as (typeof VALID_STATUSES)[number]) ||
    typeof entry.tokenSymbol !== "string" ||
    typeof entry.amount !== "string" ||
    typeof entry.sourceChainId !== "number" ||
    typeof entry.destChainId !== "number" ||
    typeof entry.recipient !== "string"
  ) {
    return NextResponse.json(
      { error: "Missing or invalid fields in history entry" },
      { status: 400 },
    );
  }

  const historyEntry: HistoryEntry = {
    timestamp: typeof entry.timestamp === "string" ? entry.timestamp : new Date().toISOString(),
    type: entry.type as HistoryEntry["type"],
    status: entry.status as HistoryEntry["status"],
    hash: typeof entry.hash === "string" ? entry.hash : undefined,
    error: typeof entry.error === "string" ? entry.error : undefined,
    tokenSymbol: entry.tokenSymbol as string,
    amount: entry.amount as string,
    sourceChainId: entry.sourceChainId as number,
    destChainId: entry.destChainId as number,
    recipient: entry.recipient as string,
  };

  try {
    await addHistoryEntry(address, historyEntry);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
