/**
 * /api/admin/settings
 *
 * Protected admin endpoints for viewing and updating app-wide settings.
 * Every request must include a valid signature from the admin address.
 *
 * GET   — Retrieve current settings (fee collector address, etc.)
 * PATCH — Update one or more settings
 */

import { NextResponse } from "next/server";
import { verifyMessage, isAddress } from "viem";
import { getFeeCollectorAddress, setFeeCollectorAddress } from "@/lib/db";

// ── Hardcoded admin address ──────────────────────────────────────────
const ADMIN_ADDRESS = "0x6CC236D96C1f02916D469dba37c52550ba0821FF".toLowerCase();

// ── Signature validity window (5 minutes) ────────────────────────────
const MAX_AGE_MS = 5 * 60 * 1000;

// ── Verify admin signature ───────────────────────────────────────────
async function verifyAdmin(
  req: Request,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
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

// ── GET — retrieve current settings ──────────────────────────────────
export async function GET(req: Request) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const feeCollectorAddress = await getFeeCollectorAddress();

    return NextResponse.json({
      feeCollectorAddress,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

// ── PATCH — update settings ──────────────────────────────────────────
export async function PATCH(req: Request) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { feeCollectorAddress?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  try {
    if (body.feeCollectorAddress !== undefined) {
      if (!isAddress(body.feeCollectorAddress)) {
        return NextResponse.json(
          { error: "Invalid Ethereum address for feeCollectorAddress" },
          { status: 400 },
        );
      }
      await setFeeCollectorAddress(body.feeCollectorAddress);
    }

    // Return updated settings
    const feeCollectorAddress = await getFeeCollectorAddress();

    return NextResponse.json({
      ok: true,
      feeCollectorAddress,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
