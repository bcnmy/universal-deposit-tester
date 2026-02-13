/**
 * Server-side balance polling + bridge execution.
 *
 * Called by the cron route (/api/cron/poll). For each registered wallet
 * it checks ERC-20 balances on all watched chains and, if a deposit is
 * detected, triggers a bridge (Across depositV3) or forward transfer
 * using the stored session signer key.
 */

import {
  createPublicClient,
  erc20Abi,
  formatUnits,
  type Address,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { optimism, base, polygon, arbitrum } from "viem/chains";
import {
  toMultichainNexusAccount,
  createMeeClient,
  meeSessionActions,
  getMEEVersion,
  MEEVersion,
} from "@biconomy/abstractjs";

import {
  SUPPORTED_TOKENS,
  SUPPORTED_CHAINS,
  BICONOMY_API_KEY,
  getTransport,
} from "../config";
import {
  c,
  shortAddr,
  fmtMs,
  kv,
  kv2,
  boxTop,
  boxLine,
  boxBottom,
  header,
  footer,
  summaryLine,
} from "./log";
import {
  getActiveAddresses,
  getSession,
  updateSession,
  decryptSessionKey,
  type SessionRecord,
} from "./db";
import { executeDepositV3 } from "../sessions/executeDepositV3";
import { executeForwardTransfer } from "../sessions/executeForwardTransfer";
import type { SessionDetails } from "../sessions/types";

// ── Constants ────────────────────────────────────────────────────────

const MIN_BRIDGE_AMOUNTS: Record<string, bigint> = {
  USDC: 100_000n,
  USDT: 100_000n,
  WETH: 10_000_000_000_000n,
};
const DEFAULT_MIN_BRIDGE = 100_000n;

const CHAIN_BY_ID = Object.fromEntries(
  SUPPORTED_CHAINS.map((ch) => [ch.id, ch]),
) as Record<number, Chain>;

/** Human-readable chain name by ID */
const CHAIN_NAME: Record<number, string> = {
  [optimism.id]: "Optimism",
  [base.id]: "Base",
  [polygon.id]: "Polygon",
  [arbitrum.id]: "Arbitrum",
};

function chainName(id: number): string {
  return CHAIN_NAME[id] ?? `chain-${id}`;
}

function fmtToken(amount: bigint, symbol: string): string {
  const token = SUPPORTED_TOKENS[symbol];
  if (!token) return `${amount} ${symbol}`;
  return `${formatUnits(amount, token.decimals)} ${symbol}`;
}

// ── Build a server-side session MEE client ───────────────────────────
// (silent — caller handles timing/logging)

async function buildSessionMeeClient(
  sessionPrivateKey: `0x${string}`,
  walletAddress: Address,
) {
  const sessionSigner = privateKeyToAccount(sessionPrivateKey);

  const mcAccount = await toMultichainNexusAccount({
    signer: sessionSigner,
    chainConfigurations: SUPPORTED_CHAINS.map((chain) => ({
      chain,
      transport: getTransport(chain),
      version: getMEEVersion(MEEVersion.V2_1_0),
      accountAddress: walletAddress,
    })),
  });

  const meeClient = await createMeeClient({
    account: mcAccount,
    apiKey: BICONOMY_API_KEY,
  });

  return meeClient.extend(meeSessionActions);
}

// ── Check balances for one wallet ────────────────────────────────────

type DetectedDeposit = {
  chainId: number;
  tokenSymbol: string;
  amount: bigint;
};

type BalanceEntry = {
  chainId: number;
  chainLabel: string;
  tokenSymbol: string;
  balance: bigint;
  formatted: string;
  threshold: string;
  aboveThreshold: boolean;
  error?: string;
};

type CheckResult = {
  entries: BalanceEntry[];
  deposit: DetectedDeposit | null;
};

async function checkBalances(
  walletAddress: Address,
  watchedChainIds: number[],
): Promise<CheckResult> {
  const entries: BalanceEntry[] = [];
  let deposit: DetectedDeposit | null = null;

  for (const chainId of watchedChainIds) {
    const chain = CHAIN_BY_ID[chainId];
    if (!chain) continue;

    const client = createPublicClient({
      chain,
      transport: getTransport(chain),
    });

    for (const token of Object.values(SUPPORTED_TOKENS)) {
      const tokenAddr = token.addresses[chainId];
      if (!tokenAddr) continue;

      const min = MIN_BRIDGE_AMOUNTS[token.symbol] ?? DEFAULT_MIN_BRIDGE;

      try {
        const balance = await client.readContract({
          address: tokenAddr,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [walletAddress],
        });

        if (balance > 0n) {
          const aboveThreshold = balance >= min;
          entries.push({
            chainId,
            chainLabel: chainName(chainId),
            tokenSymbol: token.symbol,
            balance,
            formatted: formatUnits(balance, token.decimals),
            threshold: formatUnits(min, token.decimals),
            aboveThreshold,
          });

          if (aboveThreshold && !deposit) {
            deposit = { chainId, tokenSymbol: token.symbol, amount: balance };
            return { entries, deposit }; // early return on first hit
          }
        }
      } catch (err) {
        entries.push({
          chainId,
          chainLabel: chainName(chainId),
          tokenSymbol: token.symbol,
          balance: 0n,
          formatted: "ERR",
          threshold: formatUnits(min, token.decimals),
          aboveThreshold: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { entries, deposit };
}

// ── Process a single wallet (logs boxLine content) ───────────────────

async function processWallet(record: SessionRecord): Promise<string | null> {
  const walletAddress = record.walletAddress as Address;
  const { listeningConfig } = record;
  const { destChainId, recipientIsSelf, recipientAddr } = listeningConfig;

  // ── Config ──────────────────────────────────────────────────────────
  const recipientDisplay = recipientIsSelf
    ? "Self"
    : shortAddr(recipientAddr);

  console.log(
    boxLine(
      kv2(
        "Destination",
        c.white(chainName(destChainId)),
        "Recipient",
        c.white(recipientDisplay),
      ),
    ),
  );
  console.log(
    boxLine(
      kv2(
        "Signer",
        c.cyan(shortAddr(record.sessionSignerAddress)),
        "Version",
        c.white(String(record.sessionVersion)),
      ),
    ),
  );
  console.log(boxLine());

  // ── Determine watched chains ────────────────────────────────────────
  const sourceChainIds = SUPPORTED_CHAINS.filter(
    (ch) => ch.id !== destChainId,
  ).map((ch) => ch.id);

  const watchedChainIds = recipientIsSelf
    ? sourceChainIds
    : [...sourceChainIds, destChainId];

  // ── Balance scan ────────────────────────────────────────────────────
  const chainLabels = watchedChainIds.map(chainName).join(c.dim(", "));
  console.log(
    boxLine(
      `🔍 Scanning ${c.white(String(watchedChainIds.length))} chains: ${chainLabels}`,
    ),
  );

  const checkResult = await checkBalances(walletAddress, watchedChainIds);

  // Log balance table
  if (checkResult.entries.length === 0) {
    console.log(boxLine(c.dim("   (all balances zero)")));
  } else {
    for (const e of checkResult.entries) {
      const chain = e.chainLabel.padEnd(10);
      const tok = e.tokenSymbol.padEnd(5);
      const bal = e.formatted.padStart(14);

      if (e.error) {
        console.log(
          boxLine(
            `   ${chain} ${tok} ${c.red("ERROR".padStart(14))}  ${c.dim(e.error.slice(0, 50))}`,
          ),
        );
      } else if (e.aboveThreshold) {
        console.log(
          boxLine(
            `   ${chain} ${tok} ${c.boldGreen(bal)}  💰 ${c.boldGreen(`≥ ${e.threshold}`)}`,
          ),
        );
      } else {
        console.log(
          boxLine(
            `   ${chain} ${tok} ${c.yellow(bal)}  ${c.dim(`< ${e.threshold}`)}`,
          ),
        );
      }
    }

    if (!checkResult.deposit) {
      console.log(boxLine(c.dim("   (no deposits above threshold)")));
    }
  }

  const deposit = checkResult.deposit;
  if (!deposit) return null;

  // ── Deposit detected ────────────────────────────────────────────────
  console.log(boxLine());
  console.log(
    boxLine(
      `💰 ${c.boldGreen("Deposit detected:")} ` +
        `${c.boldWhite(fmtToken(deposit.amount, deposit.tokenSymbol))} on ${c.white(chainName(deposit.chainId))}`,
    ),
  );

  // ── Decrypt + build client ──────────────────────────────────────────
  const t0 = Date.now();
  const sessionKey = decryptSessionKey(record);
  console.log(
    boxLine(`🔐 Session key decrypted ${c.dim(`(${fmtMs(Date.now() - t0)})`)}`),
  );

  const t1 = Date.now();
  const sessionMeeClient = await buildSessionMeeClient(
    sessionKey,
    walletAddress,
  );
  console.log(
    boxLine(`🔧 MEE client ready ${c.dim(`(${fmtMs(Date.now() - t1)})`)}`),
  );

  const sessionDetails = record.sessionDetails as SessionDetails;
  const recipient: Address = recipientIsSelf
    ? walletAddress
    : (recipientAddr as Address);

  const isOnDestChain = deposit.chainId === destChainId;

  // ── Execute bridge or forward ───────────────────────────────────────
  let result: { hash: string };

  if (isOnDestChain) {
    // Already on destination chain
    if (recipientIsSelf) {
      console.log(
        boxLine(
          c.dim("Deposit on dest chain & recipient is self — nothing to do"),
        ),
      );
      return null;
    }

    console.log(boxLine());
    console.log(boxLine(`📤 ${c.boldMagenta("FORWARDING")}`));
    console.log(
      boxLine(
        `   ${c.white(fmtToken(deposit.amount, deposit.tokenSymbol))} on ${c.white(chainName(destChainId))} → ${c.cyan(shortAddr(recipient))}`,
      ),
    );

    const t2 = Date.now();
    result = await executeForwardTransfer({
      sessionMeeClient,
      sessionDetails,
      walletAddress,
      recipient,
      chainId: deposit.chainId,
      amount: deposit.amount,
      tokenSymbol: deposit.tokenSymbol,
    });

    console.log(boxLine());
    console.log(
      boxLine(
        `✅ ${c.boldGreen("Forward complete")} ${c.dim(`(${fmtMs(Date.now() - t2)})`)}`,
      ),
    );
  } else {
    console.log(boxLine());
    console.log(boxLine(`🌉 ${c.boldMagenta("BRIDGING")}`));
    console.log(
      boxLine(
        `   ${c.white(chainName(deposit.chainId))} → ${c.white(chainName(destChainId))}`,
      ),
    );
    console.log(
      boxLine(
        `   ${c.boldWhite(fmtToken(deposit.amount, deposit.tokenSymbol))} → ${c.cyan(shortAddr(recipient))}` +
          (recipientIsSelf ? c.dim(" (self)") : ""),
      ),
    );

    const t2 = Date.now();
    result = await executeDepositV3({
      sessionMeeClient,
      sessionDetails,
      walletAddress,
      recipient,
      sourceChainId: deposit.chainId,
      destinationChainId: destChainId,
      amount: deposit.amount,
      tokenSymbol: deposit.tokenSymbol,
    });

    console.log(boxLine());
    console.log(
      boxLine(
        `✅ ${c.boldGreen("Bridge complete")} ${c.dim(`(${fmtMs(Date.now() - t2)})`)}`,
      ),
    );
  }

  console.log(boxLine(`   ${kv("Hash", c.yellow(result.hash))}`));
  console.log(
    boxLine(
      `   ${kv("MeeScan", c.yellow(`https://meescan.biconomy.io/details/${result.hash}`))}`,
    ),
  );

  return result.hash;
}

// ── Main entry point — called by the cron route ──────────────────────

export type PollResult = {
  processed: number;
  bridged: { walletAddress: string; hash: string }[];
  errors: { walletAddress: string; error: string }[];
};

export async function pollAllSessions(): Promise<PollResult> {
  const totalStart = Date.now();
  console.log(header("🔄", "POLL CYCLE"));

  const addresses = await getActiveAddresses();

  if (addresses.length === 0) {
    console.log(`\n  ${c.dim("No active sessions — nothing to do")}`);
    console.log(footer());
    return { processed: 0, bridged: [], errors: [] };
  }

  console.log(
    `\n  📋 ${c.bold(String(addresses.length))} active session(s): ` +
      addresses.map((a) => c.cyan(shortAddr(a))).join(c.dim(", ")) +
      "\n",
  );

  const result: PollResult = { processed: 0, bridged: [], errors: [] };

  for (const addr of addresses) {
    result.processed++;
    const walletStart = Date.now();

    // Fetch the record (before opening the box)
    const record = await getSession(addr);

    if (!record) {
      console.log(
        `  ${c.yellow("⚠")} ${c.cyan(shortAddr(addr))} ${c.dim("— no record found (skipped)")}`,
      );
      continue;
    }
    if (!record.active) {
      console.log(
        `  ${c.dim("⏸")} ${c.cyan(shortAddr(addr))} ${c.dim("— inactive (skipped)")}`,
      );
      continue;
    }

    // ── Open wallet box ───────────────────────────────────────────────
    console.log(boxTop(`👛 ${shortAddr(addr)}`));
    console.log(boxLine());

    try {
      const hash = await processWallet(record);

      // Update lastPollAt regardless of bridge
      await updateSession(addr, { lastPollAt: new Date().toISOString() });

      const elapsed = Date.now() - walletStart;

      if (hash) {
        result.bridged.push({ walletAddress: addr, hash });
      } else {
        console.log(boxLine());
        console.log(
          boxLine(c.dim(`── No action needed (${fmtMs(elapsed)})`)),
        );
      }
    } catch (err) {
      const elapsed = Date.now() - walletStart;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(boxLine());
      console.log(
        boxLine(
          `${c.boldRed("❌ ERROR")} ${c.dim(`(${fmtMs(elapsed)})`)}`,
        ),
      );
      console.log(boxLine(`   ${c.red(msg)}`));
      if (err instanceof Error && err.stack) {
        const frames = err.stack.split("\n").slice(1, 3);
        for (const frame of frames) {
          console.log(boxLine(c.dim(`   ${frame.trim()}`)));
        }
      }
      result.errors.push({ walletAddress: addr, error: msg });
    }

    // ── Close wallet box ──────────────────────────────────────────────
    console.log(boxLine());
    console.log(boxBottom());
    console.log(""); // gap between wallet blocks
  }

  // ── Summary ─────────────────────────────────────────────────────────
  const totalElapsed = Date.now() - totalStart;

  console.log(
    summaryLine([
      ["Processed", result.processed],
      ["Bridged", result.bridged.length],
      ["Errors", result.errors.length],
      ["Total", fmtMs(totalElapsed)],
    ]),
  );
  console.log(footer());

  return result;
}
