/**
 * Session storage — server is the source of truth.
 *
 * On startup the frontend queries the backend via `getServerSessionStatus()`.
 * If an active session exists the UI jumps straight to the listening
 * dashboard.  If not the user goes through the configuration / signing flow.
 *
 * The only piece stored locally (localStorage) is the **session private key**
 * so we can reuse the same signer if the user refreshes mid-pipeline.
 * Once the pipeline completes the key is sent to the server (encrypted at
 * rest) and the server handles all subsequent transaction execution.
 */

import type { SessionDetails } from "./types";
import { SESSION_VERSION } from "../config";
import { serialize } from "../lib/bigintJson";

// ═══════════════════════════════════════════════════════════════════════
//  LOCAL (localStorage) — session key only
// ═══════════════════════════════════════════════════════════════════════

const KEY_PREFIX = "nexus_session";

const keyFor = (wallet: string, suffix: string) =>
  `${KEY_PREFIX}:${wallet.toLowerCase()}:${suffix}`;

// ── Session private key ─────────────────────────────────────────────

export function saveSessionKey(
  walletAddress: string,
  privateKey: `0x${string}`,
) {
  localStorage.setItem(keyFor(walletAddress, "key"), privateKey);
}

export function loadSessionKey(
  walletAddress: string,
): `0x${string}` | null {
  const raw = localStorage.getItem(keyFor(walletAddress, "key"));
  if (raw && raw.startsWith("0x")) return raw as `0x${string}`;
  return null;
}

// ── Listening config type (shared with server) ───────────────────────

export type ListeningConfig = {
  destChainId: number;
  recipientIsSelf: boolean;
  recipientAddr: string;
  /** Token symbol the recipient should receive on the destination chain (e.g. "USDC"). Defaults to same as input token when omitted. */
  recipientTokenSymbol?: string;
};

// ── Clear local session data ─────────────────────────────────────────

export function clearSessionKey(walletAddress: string) {
  localStorage.removeItem(keyFor(walletAddress, "key"));
}

// ═══════════════════════════════════════════════════════════════════════
//  SERVER — register / check / reconfigure / deregister
// ═══════════════════════════════════════════════════════════════════════

/**
 * Register a wallet for persistent server-side monitoring.
 * Called after the full pipeline completes (install + grant + config).
 */
export async function registerSessionOnServer(params: {
  walletAddress: string;
  sessionPrivateKey: string;
  sessionSignerAddress: string;
  sessionDetails: SessionDetails;
  listeningConfig: ListeningConfig;
}): Promise<void> {
  const res = await fetch("/api/sessions/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: serialize({
      ...params,
      sessionVersion: SESSION_VERSION,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Server registration failed (${res.status})`);
  }
}

/** Check whether a wallet is registered on the server. */
export async function getServerSessionStatus(walletAddress: string): Promise<{
  registered: boolean;
  active?: boolean;
  sessionSignerAddress?: string;
  listeningConfig?: ListeningConfig;
  sessionVersion?: number;
  registeredAt?: string;
  lastPollAt?: string | null;
}> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(walletAddress.toLowerCase())}`,
  );
  if (!res.ok) return { registered: false };
  return res.json();
}

/** Reconfigure the server-side listening config. */
export async function reconfigureServerSession(
  walletAddress: string,
  patch: {
    listeningConfig?: ListeningConfig;
    sessionDetails?: SessionDetails;
    sessionVersion?: number;
    active?: boolean;
  },
): Promise<void> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(walletAddress.toLowerCase())}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: serialize(patch),
    },
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Reconfigure failed (${res.status})`);
  }
}

/** Deregister — stop server-side monitoring for a wallet. */
export async function deregisterServerSession(
  walletAddress: string,
): Promise<void> {
  await fetch(
    `/api/sessions/${encodeURIComponent(walletAddress.toLowerCase())}`,
    { method: "DELETE" },
  );
}