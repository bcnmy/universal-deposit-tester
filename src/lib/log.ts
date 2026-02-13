/**
 * Structured logging utilities — ANSI colors, box-drawing, formatters.
 *
 * Design goals:
 *   · Scannable at a glance — status icons, color coding, dot-leader alignment
 *   · Information-dense without noise — dim metadata, bold key values
 *   · Visual hierarchy — box-drawing for poll-cycle wallet blocks
 *   · Zero dependencies
 */

// ── ANSI escape codes ────────────────────────────────────────────────

const R = "\x1b[0m"; // reset
const B = "\x1b[1m"; // bold
const D = "\x1b[2m"; // dim

const FG = {
  red: "\x1b[91m",
  green: "\x1b[92m",
  yellow: "\x1b[93m",
  blue: "\x1b[94m",
  magenta: "\x1b[95m",
  cyan: "\x1b[96m",
  white: "\x1b[97m",
  gray: "\x1b[90m",
} as const;

// ── Color helpers ────────────────────────────────────────────────────

export const c = {
  bold: (s: string) => `${B}${s}${R}`,
  dim: (s: string) => `${D}${s}${R}`,

  red: (s: string) => `${FG.red}${s}${R}`,
  green: (s: string) => `${FG.green}${s}${R}`,
  yellow: (s: string) => `${FG.yellow}${s}${R}`,
  blue: (s: string) => `${FG.blue}${s}${R}`,
  magenta: (s: string) => `${FG.magenta}${s}${R}`,
  cyan: (s: string) => `${FG.cyan}${s}${R}`,
  white: (s: string) => `${FG.white}${s}${R}`,
  gray: (s: string) => `${FG.gray}${s}${R}`,

  boldRed: (s: string) => `${B}${FG.red}${s}${R}`,
  boldGreen: (s: string) => `${B}${FG.green}${s}${R}`,
  boldYellow: (s: string) => `${B}${FG.yellow}${s}${R}`,
  boldBlue: (s: string) => `${B}${FG.blue}${s}${R}`,
  boldMagenta: (s: string) => `${B}${FG.magenta}${s}${R}`,
  boldCyan: (s: string) => `${B}${FG.cyan}${s}${R}`,
  boldWhite: (s: string) => `${B}${FG.white}${s}${R}`,
} as const;

// Backward-compatible named exports (used by existing code)
export const blue = c.blue;
export const red = c.red;
export const yellow = c.yellow;
export const dim = c.dim;

// ── Formatting helpers ───────────────────────────────────────────────

/** 0x1234…5678 */
export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr || "(empty)";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Human-readable duration */
export function fmtMs(duration: number): string {
  if (duration < 1000) return `${duration}ms`;
  return `${(duration / 1000).toFixed(1)}s`;
}

/** Human-readable byte size */
export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}kB`;
}

/**
 * Key ···· Value   (dot-leader alignment)
 * Dots are dimmed for a subtle guide-line effect.
 */
export function kv(key: string, value: string, keyWidth = 14): string {
  const dots = "·".repeat(Math.max(2, keyWidth - key.length));
  return `${key} ${c.dim(dots)} ${value}`;
}

/**
 * Two key-value pairs on one line, side by side:
 *   Destination ·· Base           Recipient ·· Self
 */
export function kv2(
  k1: string,
  v1: string,
  k2: string,
  v2: string,
  col1Width = 32,
): string {
  const left = kv(k1, v1);
  const visLen = stripAnsi(left).length;
  const pad = Math.max(2, col1Width - visLen);
  return `${left}${" ".repeat(pad)}${kv(k2, v2, 12)}`;
}

// ── Box-drawing ──────────────────────────────────────────────────────
//
// Used to wrap each wallet block in the poll cycle:
//
//   ┌─── 👛 0x6CC2…21FF ──────────────────────────────
//   │  Destination ·· Base          Recipient ·· Self
//   │  ...
//   └──────────────────────────────────────────────────

const W = 76;

export const rule = (w = W) => "━".repeat(w);
export const thinRule = (w = W) => "─".repeat(w);

/** Box top border with title. */
export function boxTop(title: string, w = W): string {
  const inner = `─── ${title} `;
  return c.dim(`┌${inner}${"─".repeat(Math.max(0, w - inner.length - 1))}`);
}

/** Content line inside a box.  Empty call → just the bar. */
export function boxLine(content = ""): string {
  return content ? `${c.dim("│")}  ${content}` : c.dim("│");
}

/** Box bottom border. */
export function boxBottom(w = W): string {
  return c.dim(`└${"─".repeat(w - 1)}`);
}

// ── Section headers & footers ────────────────────────────────────────
//
// Heavy ━━━ rule + title line for major sections (poll cycles):
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//   🔄  POLL CYCLE                              2024-01-15 14:30:22 UTC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function header(icon: string, title: string, w = W): string {
  const ts =
    new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const titleStr = `  ${icon}  ${title}`;
  const gap = Math.max(1, w - titleStr.length - ts.length);
  return [
    "",
    c.boldCyan(rule(w)),
    c.boldCyan(titleStr) + " ".repeat(gap) + c.dim(ts),
    c.boldCyan(rule(w)),
  ].join("\n");
}

export function footer(w = W): string {
  return c.dim(rule(w));
}

/**
 * Compact summary bar:
 *   📊 SUMMARY  Processed 2  ·  Bridged 1  ·  Errors 0  ·  Total 3.4s
 */
export function summaryLine(
  entries: [label: string, value: string | number][],
): string {
  const parts = entries.map(
    ([k, v]) => `${c.dim(k)} ${c.boldWhite(String(v))}`,
  );
  return `\n  📊 ${c.bold("SUMMARY")}  ${parts.join(`  ${c.dim("·")}  `)}`;
}

// ── Internal utility ─────────────────────────────────────────────────

/** Strip ANSI escape codes — used for visible-length calculations. */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

