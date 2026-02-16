/**
 * In-memory store for the last cron poll timestamp.
 * Shared across API routes within the same server process.
 */

let lastPollTimestamp: number | null = null;

export function recordCronHeartbeat() {
  lastPollTimestamp = Date.now();
}

export function getLastCronHeartbeat(): number | null {
  return lastPollTimestamp;
}
