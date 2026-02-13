/**
 * /api/admin/sessions
 *
 * Protected admin endpoints for viewing and deleting sessions.
 * Every request must include a valid signature from the hardcoded admin address.
 *
 * GET    — List all sessions (active set + details)
 * DELETE — Remove a session by wallet address (?address=0x…)
 */

import { NextResponse } from "next/server";
import { verifyMessage } from "viem";
import {
  getActiveAddresses,
  getSession,
  deleteSession,
} from "@/lib/db";

// ── Hardcoded admin address ──────────────────────────────────────────
const ADMIN_ADDRESS = "0x6CC236D96C1f02916D469dba37c52550ba0821FF".toLowerCase();

// ── Signature validity window (5 minutes) ────────────────────────────
const MAX_AGE_MS = 5 * 60 * 1000;

// ── Verify admin signature ───────────────────────────────────────────
async function verifyAdmin(req: Request): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const signature = req.headers.get("x-admin-signature") as `0x${string}` | null;
  const message = req.headers.get("x-admin-message");
  const address = req.headers.get("x-admin-address");

  if (!signature || !message || !address) {
    return { ok: false, error: "Missing auth headers", status: 401 };
  }

  // Check timestamp freshness
  const tsMatch = message.match(/Timestamp:\s*(\d+)/);
  if (tsMatch) {
    const ts = parseInt(tsMatch[1], 10);
    if (Date.now() - ts > MAX_AGE_MS) {
      return { ok: false, error: "Signature expired — please sign again", status: 401 };
    }
  }

  try {
    const recovered = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature,
    });

    if (!recovered) {
      return { ok: false, error: "Invalid signature", status: 403 };
    }

    if (address.toLowerCase() !== ADMIN_ADDRESS) {
      return { ok: false, error: "Not admin", status: 403 };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Signature verification failed", status: 403 };
  }
}

// ── GET — list all sessions ──────────────────────────────────────────
export async function GET(req: Request) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const addresses = await getActiveAddresses();

    const sessions = await Promise.all(
      addresses.map(async (addr) => {
        const record = await getSession(addr);
        if (!record) return null;
        return {
          walletAddress: record.walletAddress,
          sessionSignerAddress: record.sessionSignerAddress,
          listeningConfig: record.listeningConfig,
          sessionVersion: record.sessionVersion,
          registeredAt: record.registeredAt,
          lastPollAt: record.lastPollAt,
          active: record.active,
        };
      }),
    );

    return NextResponse.json({
      sessions: sessions.filter(Boolean),
      total: addresses.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

// ── DELETE — remove a session by address ─────────────────────────────
export async function DELETE(req: Request) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json(
      { error: "Missing ?address= query parameter" },
      { status: 400 },
    );
  }

  try {
    await deleteSession(address);
    return NextResponse.json({ ok: true, deleted: address });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

