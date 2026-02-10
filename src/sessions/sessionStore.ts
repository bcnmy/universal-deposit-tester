/**
 * Thin localStorage wrapper for session-signer data.
 *
 * Keys are scoped per wallet address so multiple wallets on the same
 * browser don't collide.
 *
 * Session details are versioned — when SESSION_VERSION is bumped
 * (e.g. because we added new token permissions) any previously stored
 * session is treated as stale and loadSessionDetails returns null,
 * forcing the user to re-grant permissions.
 *
 * Later the private key will move to a backend — swap out this module
 * when that happens.
 */

import type { SessionDetails } from "./types";
import { SESSION_VERSION } from "../config";

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

// ── Session details (grant result) — versioned ──────────────────────

type StoredSessionEnvelope = {
  version: number;
  details: SessionDetails;
};

export function saveSessionDetails(
  walletAddress: string,
  details: SessionDetails,
) {
  const envelope: StoredSessionEnvelope = {
    version: SESSION_VERSION,
    details,
  };
  localStorage.setItem(
    keyFor(walletAddress, "details"),
    JSON.stringify(envelope, (_k, v) =>
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
    const parsed = JSON.parse(raw, (_k, v) => {
      if (typeof v === "string" && v.startsWith("__bigint:")) {
        return BigInt(v.slice("__bigint:".length));
      }
      return v;
    });

    // ── Version gate ────────────────────────────────────────────────
    // New format: { version, details }
    if (parsed && typeof parsed === "object" && "version" in parsed) {
      if (parsed.version !== SESSION_VERSION) {
        // Stale session — clear it and force re-grant
        localStorage.removeItem(keyFor(walletAddress, "details"));
        localStorage.removeItem(keyFor(walletAddress, "listening"));
        return null;
      }
      return parsed.details as SessionDetails;
    }

    // Old format (pre-versioning) — treat as stale
    localStorage.removeItem(keyFor(walletAddress, "details"));
    localStorage.removeItem(keyFor(walletAddress, "listening"));
    return null;
  } catch {
    return null;
  }
}

// ── Listening config (destination chain + recipient) ─────────────────

export type ListeningConfig = {
  destChainId: number;
  recipientIsSelf: boolean;
  recipientAddr: string;
};

export function saveListeningConfig(
  walletAddress: string,
  config: ListeningConfig,
) {
  localStorage.setItem(
    keyFor(walletAddress, "listening"),
    JSON.stringify(config),
  );
}

export function loadListeningConfig(
  walletAddress: string,
): ListeningConfig | null {
  const raw = localStorage.getItem(keyFor(walletAddress, "listening"));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ListeningConfig;
  } catch {
    return null;
  }
}

// ── Clear session data for a wallet ─────────────────────────────────
//    Pass `keepKey: true` to preserve the session signer private key
//    (useful when reconfiguring — no need to re-install the module).

export function clearSession(
  walletAddress: string,
  options?: { keepKey?: boolean },
) {
  if (!options?.keepKey) {
    localStorage.removeItem(keyFor(walletAddress, "key"));
  }
  localStorage.removeItem(keyFor(walletAddress, "details"));
  localStorage.removeItem(keyFor(walletAddress, "listening"));
}


