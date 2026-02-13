/**
 * Centralised JSON serialisation that preserves BigInt values.
 *
 * Every boundary in the app (client ↔ server, server ↔ Redis) uses
 * these two functions so there is exactly ONE encoding convention:
 *
 *   BigInt(42161)  ←→  "__bigint:42161"
 *
 * Import from here instead of hand-rolling JSON.stringify / JSON.parse
 * with custom replacers/revivers.
 */

const BIGINT_PREFIX = "__bigint:";

/**
 * Stringify any value, encoding BigInts as `"__bigint:<value>"` strings.
 */
export function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    typeof v === "bigint" ? `${BIGINT_PREFIX}${v.toString()}` : v,
  );
}

/**
 * Parse a JSON string, reviving `"__bigint:<value>"` strings back to
 * real BigInt values.
 */
export function deserialize<T = unknown>(raw: string): T {
  return JSON.parse(raw, (_key, v) => {
    if (typeof v === "string" && v.startsWith(BIGINT_PREFIX)) {
      return BigInt(v.slice(BIGINT_PREFIX.length));
    }
    return v;
  }) as T;
}

/**
 * Deep-walk an already-parsed object and revive any `"__bigint:…"` strings.
 *
 * Needed when the Upstash SDK auto-parses the stored JSON (without our
 * custom reviver), leaving bigint markers as plain strings.
 */
export function reviveBigInts<T = unknown>(obj: unknown): T {
  if (typeof obj === "string") {
    if (obj.startsWith(BIGINT_PREFIX)) {
      return BigInt(obj.slice(BIGINT_PREFIX.length)) as unknown as T;
    }
    return obj as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => reviveBigInts(item)) as unknown as T;
  }

  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = reviveBigInts(v);
    }
    return result as T;
  }

  // number, boolean, null — pass through
  return obj as unknown as T;
}

