/**
 * /api/sessions/[address]
 *
 * GET    — Fetch session status for a wallet
 * PATCH  — Reconfigure (update listeningConfig, sessionDetails, etc.)
 * DELETE — Deregister (stop monitoring)
 */

import { NextResponse } from "next/server";
import {
  getSession,
  updateSession,
  deleteSession,
  type ListeningConfig,
} from "@/lib/db";
import { deserialize } from "@/lib/bigintJson";
import { c, shortAddr } from "@/lib/log";

type Ctx = { params: Promise<{ address: string }> };

// ── GET — session status ─────────────────────────────────────────────

export async function GET(_req: Request, ctx: Ctx) {
  const { address } = await ctx.params;

  try {
    const record = await getSession(address);

    if (!record) {
      console.log(
        `  📋 ${c.dim("GET")} ${c.cyan(shortAddr(address))} ${c.dim("→ not found")}`,
      );
      return NextResponse.json({ registered: false });
    }

    console.log(
      `  📋 ${c.dim("GET")} ${c.cyan(shortAddr(address))} → ` +
        `active=${record.active}  v=${record.sessionVersion}  ` +
        c.dim(`lastPoll=${record.lastPollAt ?? "never"}`),
    );

    return NextResponse.json({
      registered: true,
      active: record.active,
      sessionSignerAddress: record.sessionSignerAddress,
      listeningConfig: record.listeningConfig,
      sessionVersion: record.sessionVersion,
      registeredAt: record.registeredAt,
      lastPollAt: record.lastPollAt,
    });
  } catch (err) {
    console.error(
      c.boldRed(`  ✗ GET error for ${shortAddr(address)}:`),
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

// ── PATCH — reconfigure ──────────────────────────────────────────────

export async function PATCH(req: Request, ctx: Ctx) {
  const { address } = await ctx.params;

  // Parse with bigint reviver so sessionDetails has real BigInts
  const rawText = await req.text();
  const body = deserialize<Record<string, unknown>>(rawText);

  const fields = Object.keys(body).filter((k) => body[k] !== undefined);
  console.log(
    `  🔧 ${c.dim("PATCH")} ${c.cyan(shortAddr(address))} ${c.dim(`[${fields.join(", ")}]`)}`,
  );

  try {
    const patch: Parameters<typeof updateSession>[1] = {};

    if (body.listeningConfig) {
      patch.listeningConfig = body.listeningConfig as ListeningConfig;
    }
    if (body.sessionDetails !== undefined) {
      patch.sessionDetails = body.sessionDetails;
    }
    if (body.sessionVersion !== undefined) {
      patch.sessionVersion = body.sessionVersion as number;
    }
    if (body.active !== undefined) {
      patch.active = body.active as boolean;
    }

    await updateSession(address, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(
      c.boldRed(`  ✗ PATCH error for ${shortAddr(address)}:`),
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

// ── DELETE — deregister ──────────────────────────────────────────────

export async function DELETE(_req: Request, ctx: Ctx) {
  const { address } = await ctx.params;
  console.log(
    `  🗑  ${c.dim("DELETE")} ${c.cyan(shortAddr(address))}`,
  );

  try {
    await deleteSession(address);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(
      c.boldRed(`  ✗ DELETE error for ${shortAddr(address)}:`),
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
