/**
 * Persistent session storage backed by Upstash Redis
 * (provisioned via Vercel marketplace).
 *
 * Vercel auto-injects these env vars when the store is linked:
 *   KV_REST_API_URL
 *   KV_REST_API_TOKEN
 *
 * Each registered wallet gets a key:
 *   session:<walletAddress>  →  JSON SessionRecord
 *
 * The set of all registered wallets is maintained via a Redis SET:
 *   sessions:active          →  { walletAddress, … }
 *
 * Serialisation note:
 *   All BigInt values are encoded as "__bigint:<value>" via the shared
 *   bigintJson module.  `sessionDetails` is stored as a **live object**
 *   (not a pre-serialised string) so there is only ONE layer of JSON.
 */

import { Redis } from "@upstash/redis";
import { encryptPrivateKey, decryptPrivateKey } from "./encrypt";
import { serialize, deserialize, reviveBigInts } from "./bigintJson";
import { c, shortAddr, fmtBytes } from "./log";

// ── Types ────────────────────────────────────────────────────────────

export type ListeningConfig = {
  destChainId: number;
  recipientIsSelf: boolean;
  recipientAddr: string;
};

/**
 * What we store in Redis for each wallet.
 * `encryptedKey` holds the session signer private key encrypted at rest.
 * `sessionDetails` is the live object (BigInts revived on read).
 */
export type SessionRecord = {
  walletAddress: string;
  /** Encrypted session signer private key */
  encryptedKey: string;
  /** Session signer address (public, for quick lookup) */
  sessionSignerAddress: string;
  /**
   * Session grant details from Biconomy — stored as a plain object.
   * BigInt fields are serialised as "__bigint:…" by the shared module
   * and revived on read.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessionDetails: any;
  /** Listening configuration */
  listeningConfig: ListeningConfig;
  /** Session version — must match current config to be valid */
  sessionVersion: number;
  /** ISO timestamp of registration */
  registeredAt: string;
  /** ISO timestamp of last successful poll */
  lastPollAt: string | null;
  /** Whether the session is actively being polled */
  active: boolean;
};

// ── Redis client (lazy singleton) ────────────────────────────────────

let _redis: Redis | null = null;

function redis(): Redis {
  if (!_redis) {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) {
      console.error(
        c.boldRed(`  🗄 ✗ Redis env vars missing!`) +
          ` KV_REST_API_URL=${url ? "set" : c.red("MISSING")}` +
          ` KV_REST_API_TOKEN=${token ? "set" : c.red("MISSING")}`,
      );
      throw new Error(
        "Redis configuration missing — check KV_REST_API_URL and KV_REST_API_TOKEN env vars",
      );
    }
    _redis = new Redis({ url, token });
  }
  return _redis;
}

/** A single bridge/forward/sweep history entry stored per wallet. */
export type HistoryEntry = {
  timestamp: string;
  type: "bridge" | "forward" | "sweep";
  status: "success" | "error";
  hash?: string;
  error?: string;
  tokenSymbol: string;
  amount: string;
  sourceChainId: number;
  destChainId: number;
  recipient: string;
};

// ── Key helpers ──────────────────────────────────────────────────────

const sessionKey = (addr: string) => `session:${addr.toLowerCase()}`;
const historyKey = (addr: string) => `history:${addr.toLowerCase()}`;
const ACTIVE_SET = "sessions:active";

// ── Internal: parse a raw Redis value into a SessionRecord ───────────

/**
 * Upstash may return a raw string OR an already-parsed object depending
 * on SDK version / internal behaviour.  This helper normalises either
 * form into a SessionRecord with BigInts properly revived.
 *
 * It also handles **legacy records** where `sessionDetails` was stored
 * as a pre-serialised JSON string (the old JSON-inside-JSON layout).
 */
function parseRawRecord(raw: string | Record<string, unknown>): SessionRecord {
  let record: SessionRecord;

  if (typeof raw === "string") {
    record = deserialize<SessionRecord>(raw);
  } else {
    record = reviveBigInts<SessionRecord>(raw);
  }

  // Legacy migration: old records stored sessionDetails as a JSON string.
  if (typeof record.sessionDetails === "string") {
    record.sessionDetails = deserialize(record.sessionDetails);
  }

  return record;
}

// ── Public API ───────────────────────────────────────────────────────

export async function registerSession(params: {
  walletAddress: string;
  sessionPrivateKey: string;
  sessionSignerAddress: string;
  /** sessionDetails — object with real BigInts */
  sessionDetails: unknown;
  listeningConfig: ListeningConfig;
  sessionVersion: number;
}): Promise<void> {
  const addr = params.walletAddress.toLowerCase();

  const encryptedKey = encryptPrivateKey(params.sessionPrivateKey);

  const record: SessionRecord = {
    walletAddress: addr,
    encryptedKey,
    sessionSignerAddress: params.sessionSignerAddress,
    sessionDetails: params.sessionDetails,
    listeningConfig: params.listeningConfig,
    sessionVersion: params.sessionVersion,
    registeredAt: new Date().toISOString(),
    lastPollAt: null,
    active: true,
  };

  const r = redis();
  const key = sessionKey(addr);
  const payload = serialize(record);

  await r.set(key, payload);
  await r.sadd(ACTIVE_SET, addr);

  console.log(
    c.dim(
      `  🗄 Registered ${shortAddr(addr)}  (${fmtBytes(payload.length)})`,
    ),
  );
}

export async function getSession(
  walletAddress: string,
): Promise<SessionRecord | null> {
  const raw = await redis().get<string | Record<string, unknown>>(
    sessionKey(walletAddress),
  );
  if (!raw) return null;

  try {
    return parseRawRecord(raw);
  } catch (err) {
    console.error(
      c.boldRed(`  🗄 ✗ Failed to parse session for ${shortAddr(walletAddress)}`),
    );
    console.error(
      `     ${c.red(err instanceof Error ? err.message : String(err))}`,
    );
    throw err;
  }
}

export async function updateSession(
  walletAddress: string,
  patch: Partial<
    Pick<
      SessionRecord,
      | "listeningConfig"
      | "sessionDetails"
      | "sessionVersion"
      | "lastPollAt"
      | "active"
    >
  >,
): Promise<void> {
  const existing = await getSession(walletAddress);
  if (!existing) throw new Error("Session not found");

  const updated: SessionRecord = { ...existing, ...patch };

  const r = redis();
  const payload = serialize(updated);
  await r.set(sessionKey(walletAddress), payload);

  if (patch.active === false) {
    await r.srem(ACTIVE_SET, walletAddress.toLowerCase());
  } else if (patch.active === true) {
    await r.sadd(ACTIVE_SET, walletAddress.toLowerCase());
  }
}

export async function deleteSession(walletAddress: string): Promise<void> {
  const r = redis();
  await r.del(sessionKey(walletAddress));
  await r.srem(ACTIVE_SET, walletAddress.toLowerCase());
  console.log(
    c.dim(`  🗄 Deleted session for ${shortAddr(walletAddress)}`),
  );
}

/** Returns all wallet addresses that are actively monitored. */
export async function getActiveAddresses(): Promise<string[]> {
  return (await redis().smembers(ACTIVE_SET)) as string[];
}

/** Decrypt the session private key from a stored record. */
export function decryptSessionKey(record: SessionRecord): `0x${string}` {
  return decryptPrivateKey(record.encryptedKey) as `0x${string}`;
}

// ── History API ──────────────────────────────────────────────────────

/**
 * Retrieve a page of history entries for a wallet (newest first).
 * Uses a Redis list (`history:<address>`) where entries are LPUSHed,
 * so index 0 is always the most recent.
 */
export async function getHistory(
  walletAddress: string,
  offset = 0,
  limit = 50,
): Promise<HistoryEntry[]> {
  const raw = await redis().lrange(historyKey(walletAddress), offset, offset + limit - 1);
  return (raw as (string | Record<string, unknown>)[]).map((item) => {
    if (typeof item === "string") {
      return deserialize<HistoryEntry>(item);
    }
    return reviveBigInts<HistoryEntry>(item);
  });
}

/** Return the total number of history entries for a wallet. */
export async function getHistoryCount(walletAddress: string): Promise<number> {
  return redis().llen(historyKey(walletAddress));
}

/**
 * Push a new history entry to the front of the wallet's history list.
 * Newest entries are always at index 0.
 */
export async function addHistoryEntry(
  walletAddress: string,
  entry: HistoryEntry,
): Promise<void> {
  const payload = serialize(entry);
  await redis().lpush(historyKey(walletAddress), payload);
  console.log(
    c.dim(
      `  🗄 History entry for ${shortAddr(walletAddress)}  (${fmtBytes(payload.length)})`,
    ),
  );
}

/**
 * Nuclear option: flush the entire Redis database.
 * This removes ALL keys — sessions, history, active set, everything.
 * Returns the count of active sessions that were wiped (for logging).
 */
export async function deleteAllData(): Promise<{ sessionsWiped: number }> {
  const r = redis();

  // Grab count before nuking so we can report it
  const addresses = (await r.smembers(ACTIVE_SET)) as string[];
  const count = addresses.length;

  await r.flushdb();

  console.log(
    c.boldRed(`  🗄 ⚠ FLUSHED entire Redis database — ${count} session(s) wiped`),
  );

  return { sessionsWiped: count };
}
