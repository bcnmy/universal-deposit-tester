/**
 * Session storage — dual layer.
 *
 * **Local (localStorage)**:  fast client cache for the active tab so UI
 * resumes instantly on refresh.  Same as before.
 *
 * **Server (API calls)**:  the source of truth.  When the user finishes
 * the setup pipeline the client calls `registerSessionOnServer()` which
 * POSTs the session key + details + config to the backend.  From that
 * point the server polls and bridges even when the tab is closed.
 *
 * Local helpers are still exported (and used by usePipeline for fast
 * hydration), but the server registration is what enables background
 * execution.
 */

import type { SessionDetails } from "./types";
import { SESSION_VERSION } from "../config";
import { serialize, deserialize } from "../lib/bigintJson";

// ═══════════════════════════════════════════════════════════════════════
//  LOCAL (localStorage) — fast client-side cache
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
  localStorage.setItem(keyFor(walletAddress, "details"), serialize(envelope));
}

export function loadSessionDetails(
  walletAddress: string,
): SessionDetails | null {
  const raw = localStorage.getItem(keyFor(walletAddress, "details"));
  if (!raw) return null;
  try {
    const parsed = deserialize<StoredSessionEnvelope>(raw);

    if (parsed && typeof parsed === "object" && "version" in parsed) {
      if (parsed.version !== SESSION_VERSION) {
        localStorage.removeItem(keyFor(walletAddress, "details"));
        localStorage.removeItem(keyFor(walletAddress, "listening"));
        return null;
      }
      return parsed.details as SessionDetails;
    }

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

// ── Clear local session data ─────────────────────────────────────────

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
