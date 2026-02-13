/**
 * POST /api/sessions/register
 *
 * Register a wallet for persistent server-side monitoring.
 * Called by the frontend after the full setup pipeline completes
 * (connect → sign auth → install module → grant permission).
 *
 * Body:
 *  - walletAddress: string
 *  - sessionPrivateKey: string (0x-prefixed hex)
 *  - sessionSignerAddress: string
 *  - sessionDetails: object (the grant result — may contain __bigint: strings)
 *  - listeningConfig: { destChainId, recipientIsSelf, recipientAddr }
 *  - sessionVersion: number
 */

import { NextResponse } from "next/server";
import { registerSession } from "@/lib/db";
import { deserialize } from "@/lib/bigintJson";
import { c, shortAddr, fmtMs } from "@/lib/log";

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    // Parse with bigint reviver so sessionDetails has real BigInts
    const rawText = await request.text();
    const body = deserialize<Record<string, unknown>>(rawText);

    const {
      walletAddress,
      sessionPrivateKey,
      sessionSignerAddress,
      sessionDetails,
      listeningConfig,
      sessionVersion,
    } = body as {
      walletAddress: string;
      sessionPrivateKey: string;
      sessionSignerAddress: string;
      sessionDetails: unknown;
      listeningConfig: {
        destChainId: number;
        recipientIsSelf: boolean;
        recipientAddr: string;
      };
      sessionVersion: number;
    };

    const lc = listeningConfig;
    console.log(
      `\n  📝 ${c.boldBlue("REGISTER")} ${c.cyan(shortAddr(walletAddress))}` +
        `  signer=${c.cyan(shortAddr(sessionSignerAddress))}` +
        `  v=${sessionVersion}` +
        `  dest=${lc?.destChainId}` +
        `  recipient=${lc?.recipientIsSelf ? "self" : shortAddr(lc?.recipientAddr)}`,
    );

    // Basic validation
    if (
      !walletAddress ||
      !sessionPrivateKey ||
      !sessionSignerAddress ||
      !sessionDetails ||
      !listeningConfig ||
      sessionVersion === undefined
    ) {
      const missing = [
        !walletAddress && "walletAddress",
        !sessionPrivateKey && "sessionPrivateKey",
        !sessionSignerAddress && "sessionSignerAddress",
        !sessionDetails && "sessionDetails",
        !listeningConfig && "listeningConfig",
        sessionVersion === undefined && "sessionVersion",
      ].filter(Boolean);

      console.error(
        c.boldRed(`  ❌ Missing fields: ${missing.join(", ")}`),
      );
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    await registerSession({
      walletAddress,
      sessionPrivateKey,
      sessionSignerAddress,
      sessionDetails,
      listeningConfig,
      sessionVersion,
    });

    console.log(
      `  ${c.green("✅")} Registered ${c.dim(`(${fmtMs(Date.now() - startTime)})`)}`,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(
      `  ${c.boldRed("❌ Register failed")} ${c.dim(`(${fmtMs(Date.now() - startTime)})`)}`,
    );
    console.error(
      `     ${c.red(err instanceof Error ? err.message : String(err))}`,
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
