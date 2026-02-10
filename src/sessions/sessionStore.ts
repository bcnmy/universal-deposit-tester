/**
 * Thin localStorage wrapper for session-signer data.
 *
 * Keys are scoped per wallet address so multiple wallets on the same
 * browser don't collide.
 *
 * Later the private key will move to a backend — swap out this module
 * when that happens.
 */

import type { SessionDetails } from "./types";

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

// ── Session details (grant result) ──────────────────────────────────

export function saveSessionDetails(
  walletAddress: string,
  details: SessionDetails,
) {
  localStorage.setItem(
    keyFor(walletAddress, "details"),
    JSON.stringify(details, (_k, v) =>
      typeof v === "bigint" ? `__bigint:${v.toString()}` : v,
    ),
  );
}

export function loadSessionDetails(
  walletAddress: string,
): SessionDetails | null {
  const raw = localStorage.getItem(keyFor(walletAddress, "details"));
  if (!raw) return null;
  try {
    return JSON.parse(raw, (_k, v) => {
      if (typeof v === "string" && v.startsWith("__bigint:")) {
        return BigInt(v.slice("__bigint:".length));
      }
      return v;
    }) as SessionDetails;
  } catch {
    return null;
  }
}

// ── Clear everything for a wallet ───────────────────────────────────

export function clearSession(walletAddress: string) {
  localStorage.removeItem(keyFor(walletAddress, "key"));
  localStorage.removeItem(keyFor(walletAddress, "details"));
}


