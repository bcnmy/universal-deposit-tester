"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const COUNTDOWN_FROM = 60;
const HEARTBEAT_POLL_INTERVAL = 3_000; // poll heartbeat every 3s

/**
 * Polls /api/cron/heartbeat and returns a countdown (seconds) that
 * resets to 60 every time a new cron poll is detected.
 *
 * Starts counting immediately when enabled, and resyncs whenever
 * a new cron heartbeat is detected from the server.
 */
export function useCronCountdown(enabled: boolean) {
  const [countdown, setCountdown] = useState<number>(COUNTDOWN_FROM);
  const lastPollRef = useRef<number | null>(null);

  // Reset countdown to 60
  const resetCountdown = useCallback(() => {
    setCountdown(COUNTDOWN_FROM);
  }, []);

  // Tick the countdown down every second
  useEffect(() => {
    if (!enabled) return;

    const tick = setInterval(() => {
      setCountdown((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1_000);

    return () => clearInterval(tick);
  }, [enabled]);

  // Reset when enabled changes to true
  useEffect(() => {
    if (enabled) setCountdown(COUNTDOWN_FROM);
  }, [enabled]);

  // Poll the heartbeat endpoint — reset on every new cron run
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/api/cron/heartbeat");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        const serverTs: number | null = data.lastPollAt;

        if (serverTs && serverTs !== lastPollRef.current) {
          lastPollRef.current = serverTs;
          resetCountdown();
        }
      } catch {
        // Silently ignore fetch failures
      }
    };

    check();
    const interval = setInterval(check, HEARTBEAT_POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, resetCountdown]);

  return enabled ? countdown : null;
}
