import type { Status, StepStatus } from "./types";
import { MEESCAN_URL } from "./constants";
import { SUPPORTED_TOKENS } from "./config";

/** Truncate an address / hash for display: 0x1234…abcd */
export const shortAddr = (addr: string) =>
  `${addr.slice(0, 6)}…${addr.slice(-4)}`;

/** Build MeeScan explorer link for a supertransaction hash */
export const meescanLink = (hash: string) => `${MEESCAN_URL}/${hash}`;

/** Validate an Ethereum address (0x + 40 hex chars) */
export const isValidAddress = (addr: string) =>
  /^0x[a-fA-F0-9]{40}$/.test(addr);

/** Format a token amount given its decimals for display */
export const formatTokenAmount = (amount: bigint, decimals: number): string => {
  const n = Number(amount) / 10 ** decimals;
  return decimals <= 8 ? n.toFixed(2) : n.toFixed(4);
};

/** Format a USDC amount (6 decimals) for display */
export const formatUSDC = (amount: bigint): string =>
  formatTokenAmount(amount, 6);

/** Format an amount using the token symbol to look up decimals */
export const formatTokenBySymbol = (amount: bigint, symbol: string): string => {
  const token = SUPPORTED_TOKENS[symbol];
  return formatTokenAmount(amount, token?.decimals ?? 18);
};

/**
 * Derive the visual StepStatus from readiness + async status.
 * For the login step, pass `isLoginStep = true` and `authenticated`.
 */
export const deriveStatus = (
  ready: boolean,
  status: Status,
  isLoginStep?: boolean,
  authenticated?: boolean,
): StepStatus => {
  if (isLoginStep) return authenticated ? "completed" : "active";
  if (!ready) return "pending";
  if (status === "error") return "error";
  if (status === "success") return "completed";
  return "active";
};

