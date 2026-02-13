#!/usr/bin/env node
/**
 * Local cron replacement — polls /api/cron/poll on a timer.
 *
 * Usage:  node scripts/local-cron.mjs [intervalSeconds] [port]
 *
 * Defaults: interval = 10s, port = 3000
 *
 * Loads .env / .env.local / .env.development.local so it picks up
 * CRON_SECRET and PORT automatically.
 *
 * Waits for the Next.js server to be ready before starting.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ── ANSI helpers ─────────────────────────────────────────────────────
const R = "\x1b[0m";
const B = "\x1b[1m";
const D = "\x1b[2m";
const RED = "\x1b[91m";
const GRN = "\x1b[92m";
const YEL = "\x1b[93m";
const CYN = "\x1b[96m";
const GRY = "\x1b[90m";

const bold = (s) => `${B}${s}${R}`;
const dim = (s) => `${D}${s}${R}`;
const red = (s) => `${RED}${s}${R}`;
const green = (s) => `${GRN}${s}${R}`;
const yellow = (s) => `${YEL}${s}${R}`;
const cyan = (s) => `${CYN}${s}${R}`;
const gray = (s) => `${GRY}${s}${R}`;

const boldCyan = (s) => `${B}${CYN}${s}${R}`;
const boldRed = (s) => `${B}${RED}${s}${R}`;
const boldGreen = (s) => `${B}${GRN}${s}${R}`;

const rule = (w = 56) => "━".repeat(w);
const thin = (w = 56) => "─".repeat(w);

function shortAddr(addr) {
  if (!addr || addr.length < 10) return addr || "(empty)";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Load .env files (same priority as Next.js) ─────────────────────
const ROOT = resolve(import.meta.dirname || ".", "..");

function loadEnvFile(filename) {
  try {
    const content = readFileSync(resolve(ROOT, filename), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // File doesn't exist — that's fine
  }
}

loadEnvFile(".env.development.local");
loadEnvFile(".env.local");
loadEnvFile(".env");

// ── Config ──────────────────────────────────────────────────────────
const INTERVAL = parseInt(process.argv[2] || "10", 10) * 1000;
const PORT = process.argv[3] || process.env.PORT || "3000";
const BASE = `http://localhost:${PORT}`;
const ENDPOINT = `${BASE}/api/cron/poll`;
const CRON_SECRET = process.env.CRON_SECRET || "";

let pollCount = 0;

// ── Poll function ───────────────────────────────────────────────────
async function poll() {
  pollCount++;
  const start = Date.now();
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);

  console.log(`\n  ${dim(thin())}`);
  console.log(`  ${bold(`▶ #${pollCount}`)}  ${dim(ts)}`);

  try {
    const headers = {};
    if (CRON_SECRET) {
      headers["Authorization"] = `Bearer ${CRON_SECRET}`;
    }

    const res = await fetch(ENDPOINT, { headers });
    const elapsed = Date.now() - start;
    const contentType = res.headers.get("content-type") || "";

    // Guard against non-JSON responses (e.g. Next.js error pages)
    if (!contentType.includes("application/json")) {
      const text = await res.text();
      console.log(
        `  ${boldRed(`✗ ${res.status}`)} ${dim(`(${fmtMs(elapsed)})`)} — non-JSON response`,
      );
      console.log(`    ${dim(text.slice(0, 120))}`);
      return;
    }

    const body = await res.json();

    if (!res.ok) {
      console.log(
        `  ${boldRed(`✗ ${res.status}`)} ${dim(`(${fmtMs(elapsed)})`)} — ${red(body.error || "unknown error")}`,
      );
      return;
    }

    // Success — single summary line
    const p = body.processed ?? 0;
    const b = body.bridged?.length ?? 0;
    const e = body.errors?.length ?? 0;

    const statusIcon = e > 0 ? yellow("⚠") : b > 0 ? boldGreen("✅") : green("✓");
    console.log(
      `  ${statusIcon} ${bold(String(res.status))} ${dim(`(${fmtMs(elapsed)})`)}` +
        `  processed=${bold(String(p))}  bridged=${b > 0 ? boldGreen(String(b)) : dim(String(b))}` +
        `  errors=${e > 0 ? boldRed(String(e)) : dim(String(e))}`,
    );

    // Detail lines for bridges and errors
    if (body.bridged?.length > 0) {
      for (const br of body.bridged) {
        console.log(
          `    ${green("↳")} ${cyan(shortAddr(br.walletAddress))} → ${yellow(br.hash)}`,
        );
      }
    }
    if (body.errors?.length > 0) {
      for (const er of body.errors) {
        console.log(
          `    ${red("↳")} ${cyan(shortAddr(er.walletAddress))} — ${red(er.error)}`,
        );
      }
    }
  } catch (err) {
    const elapsed = Date.now() - start;
    console.log(
      `  ${boldRed("✗ Fetch failed")} ${dim(`(${fmtMs(elapsed)})`)} — ${red(err.message)}`,
    );
  }
}

// ── Wait for server ─────────────────────────────────────────────────
async function waitForServer(maxRetries = 30) {
  console.log(`\n  ${dim("Waiting for server at")} ${cyan(BASE)} ${dim("…")}`);
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fetch(BASE, { method: "HEAD" });
      console.log(`  ${green("✅")} Server ready\n`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.error(
    boldRed(`  ✗ Server did not start after ${maxRetries * 2}s — giving up`),
  );
  process.exit(1);
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${boldCyan(rule())}`);
  console.log(`  ⏰  ${bold("LOCAL CRON")}`);
  console.log(boldCyan(rule()));
  console.log(
    `  Interval ${dim("··")} ${bold(`${INTERVAL / 1000}s`)}` +
      `     Port ${dim("··")} ${bold(PORT)}`,
  );
  console.log(
    `  Secret ${dim("····")} ${CRON_SECRET ? green("set ✓") : yellow("not set (no auth header)")}`,
  );
  console.log(
    `  Endpoint ${dim("··")} ${dim(ENDPOINT)}`,
  );

  await waitForServer();

  // First poll immediately
  await poll();

  // Then on interval
  setInterval(poll, INTERVAL);
}

main();
