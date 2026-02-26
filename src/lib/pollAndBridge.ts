/**
 * Server-side balance polling + bridge execution.
 *
 * Called by the cron route (/api/cron/poll). For each registered wallet
 * it checks ERC-20 balances for ALL tokens on ALL watched chains and
 * bridges/forwards every deposit above threshold in a single poll cycle.
 *
 * All wallets are scanned and executed in PARALLEL for speed.
 * Within a single wallet, deposits are processed sequentially only when
 * the first tx needs ENABLE_AND_USE mode (must mine before subsequent txs).
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
  SESSION_VERSION,
  getTransport,
} from "../config";
import {
  c,
  shortAddr,
  fmtMs,
  header,
  footer,
  summaryLine,
} from "./log";
import {
  getActiveAddresses,
  getSession,
  updateSession,
  decryptSessionKey,
  addHistoryEntry,
  getFeeCollectorAddress,
  type SessionRecord,
} from "./db";
import { executeDepositV3 } from "../sessions/executeDepositV3";
import { executeForwardTransfer } from "../sessions/executeForwardTransfer";
import type { SessionDetails } from "../sessions/types";
import { getPostHogClient } from "./posthog-server";

// ── Constants ────────────────────────────────────────────────────────

/** Symbol used internally for native ETH deposits (not an ERC-20 token) */
const NATIVE_ETH_SYMBOL = "ETH";

const MIN_BRIDGE_AMOUNTS: Record<string, bigint> = {
  USDC: 100_000n,
  USDT: 100_000n,
  WETH: 10_000_000_000_000n,
  [NATIVE_ETH_SYMBOL]: 10_000_000_000_000n, // 0.00001 ETH
};
const DEFAULT_MIN_BRIDGE = 100_000n;

/** Biconomy MEE explorer endpoint for tracking supertransaction execution */
const MEE_EXPLORER_URL = "https://network.biconomy.io/v1/explorer";
/** How often to poll the explorer while waiting for a supertx to mine */
const MINE_POLL_INTERVAL_MS = 3_000;
/** Maximum time to wait for a supertx to mine before giving up */
const MINE_POLL_TIMEOUT_MS = 120_000;

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
  if (symbol === NATIVE_ETH_SYMBOL) return `${formatUnits(amount, 18)} ${symbol}`;
  const token = SUPPORTED_TOKENS[symbol];
  if (!token) return `${amount} ${symbol}`;
  return `${formatUnits(amount, token.decimals)} ${symbol}`;
}

// ── Build a server-side session MEE client ───────────────────────────

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

// ── Wait for a supertransaction to be mined on-chain ─────────────────
//
// When the first supertx uses ENABLE_AND_USE mode (new session), we must
// wait for it to confirm before submitting subsequent txs — otherwise
// they'll also try ENABLE_AND_USE (since checkEnabledPermissions still
// returns false) and collide with the first enable.

async function waitForSupertxMined(hash: string): Promise<void> {
  const start = Date.now();
  const url = `${MEE_EXPLORER_URL}/${hash}`;

  while (Date.now() - start < MINE_POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, MINE_POLL_INTERVAL_MS));

    try {
      const res = await fetch(url, {
        headers: { "X-API-Key": BICONOMY_API_KEY },
      });

      if (!res.ok) continue;

      const data = await res.json();
      const mainOp = data.userOps?.[1];
      if (!mainOp?.executionStatus) continue;

      const status = mainOp.executionStatus as string;

      if (status === "MINED_SUCCESS") return;

      if (status === "MINED_FAILURE" || status === "REVERTED") {
        throw new Error(`Supertx ${hash} failed on-chain: ${status}`);
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes("failed on-chain")
      ) {
        throw err;
      }
    }
  }

  throw new Error(
    `Timed out waiting for supertx ${hash} to mine (${MINE_POLL_TIMEOUT_MS / 1000}s)`,
  );
}

// ── Check balances for one wallet (all chains/tokens in parallel) ────

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
  deposits: DetectedDeposit[];
};

async function checkBalances(
  walletAddress: Address,
  watchedChainIds: number[],
): Promise<CheckResult> {
  const entries: BalanceEntry[] = [];
  const deposits: DetectedDeposit[] = [];

  const checks: Promise<void>[] = [];

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

      checks.push(
        client
          .readContract({
            address: tokenAddr,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [walletAddress],
          })
          .then((balance) => {
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

              if (aboveThreshold) {
                deposits.push({
                  chainId,
                  tokenSymbol: token.symbol,
                  amount: balance,
                });
              }
            }
          })
          .catch((err) => {
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
          }),
      );
    }

    // Check native ETH balance (will be wrapped to WETH before bridging)
    const ethMin = MIN_BRIDGE_AMOUNTS[NATIVE_ETH_SYMBOL] ?? DEFAULT_MIN_BRIDGE;
    checks.push(
      client
        .getBalance({ address: walletAddress })
        .then((balance) => {
          if (balance > 0n) {
            const aboveThreshold = balance >= ethMin;
            entries.push({
              chainId,
              chainLabel: chainName(chainId),
              tokenSymbol: NATIVE_ETH_SYMBOL,
              balance,
              formatted: formatUnits(balance, 18),
              threshold: formatUnits(ethMin, 18),
              aboveThreshold,
            });

            if (aboveThreshold) {
              deposits.push({
                chainId,
                tokenSymbol: NATIVE_ETH_SYMBOL,
                amount: balance,
              });
            }
          }
        })
        .catch((err) => {
          entries.push({
            chainId,
            chainLabel: chainName(chainId),
            tokenSymbol: NATIVE_ETH_SYMBOL,
            balance: 0n,
            formatted: "ERR",
            threshold: formatUnits(ethMin, 18),
            aboveThreshold: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }),
    );
  }

  await Promise.all(checks);

  return { entries, deposits };
}

// ── Types for scan + execution results ───────────────────────────────

type WalletScan = {
  addr: string;
  record: SessionRecord;
  checkResult: CheckResult;
  watchedChainIds: number[];
  actionableDeposits: DetectedDeposit[];
};

type ActionSuccess = {
  walletAddress: string;
  type: "bridge" | "forward";
  tokenSymbol: string;
  amount: string;
  sourceChain: string;
  destChain: string;
  hash: string;
  meescanUrl: string;
};

type ActionFailure = {
  walletAddress: string;
  type: "bridge" | "forward";
  tokenSymbol: string;
  amount: string;
  sourceChain: string;
  destChain: string;
  error: string;
};

type WalletExecResult = {
  successes: ActionSuccess[];
  failures: ActionFailure[];
};

// ── Execute all actions for a single wallet ──────────────────────────

async function executeWalletActions(
  scan: WalletScan,
  feeCollectorAddress: Address,
): Promise<WalletExecResult> {
  const { record, actionableDeposits } = scan;
  const walletAddress = record.walletAddress as Address;
  const { destChainId, recipientIsSelf, recipientAddr, recipientTokenSymbol } =
    record.listeningConfig;

  console.log(
    `  [exec] ${c.cyan(shortAddr(walletAddress))} ` +
      `recipientTokenSymbol=${recipientTokenSymbol ?? "(undefined → same-as-input)"} ` +
      `dest=${chainName(destChainId)} ` +
      `deposits=${actionableDeposits.length}`,
  );

  const successes: ActionSuccess[] = [];
  const failures: ActionFailure[] = [];

  // Decrypt + build client once for all deposits
  const sessionKey = decryptSessionKey(record);
  const sessionMeeClient = await buildSessionMeeClient(
    sessionKey,
    walletAddress,
  );
  const sessionDetails = record.sessionDetails as SessionDetails;
  const recipient: Address = recipientIsSelf
    ? walletAddress
    : (recipientAddr as Address);

  // Check if session permissions are already enabled
  const enabledMap: Record<string, Record<number, boolean>> =
    await sessionMeeClient.checkEnabledPermissions(sessionDetails);
  const permissionsPreEnabled = Object.values(enabledMap).some((chainMap) =>
    Object.values(chainMap).some((v) => v === true),
  );

  // Execute each deposit (sequentially due to ENABLE_AND_USE constraint)
  for (let i = 0; i < actionableDeposits.length; i++) {
    const deposit = actionableDeposits[i];
    const isOnDestChain = deposit.chainId === destChainId;
    const type: "bridge" | "forward" = isOnDestChain ? "forward" : "bridge";
    const sourceChain = chainName(deposit.chainId);
    const destChain = chainName(destChainId);
    const amountStr = fmtToken(deposit.amount, deposit.tokenSymbol);

    try {
      let result: { hash: string };

      const isNativeETH = deposit.tokenSymbol === NATIVE_ETH_SYMBOL;

      if (isOnDestChain) {
        if (isNativeETH) {
          // Native ETH on dest chain: wrap to WETH, then forward as WETH
          result = await executeDepositV3({
            sessionMeeClient,
            sessionDetails,
            walletAddress,
            recipient,
            sourceChainId: deposit.chainId,
            destinationChainId: deposit.chainId,
            amount: deposit.amount,
            tokenSymbol: "WETH",
            outputTokenSymbol: recipientTokenSymbol,
            feeCollectorAddress,
            wrapNativeETH: true,
          });
        } else {
          result = await executeForwardTransfer({
            sessionMeeClient,
            sessionDetails,
            walletAddress,
            recipient,
            chainId: deposit.chainId,
            amount: deposit.amount,
            tokenSymbol: deposit.tokenSymbol,
          });
        }
      } else {
        result = await executeDepositV3({
          sessionMeeClient,
          sessionDetails,
          walletAddress,
          recipient,
          sourceChainId: deposit.chainId,
          destinationChainId: destChainId,
          amount: deposit.amount,
          tokenSymbol: isNativeETH ? "WETH" : deposit.tokenSymbol,
          outputTokenSymbol: recipientTokenSymbol,
          feeCollectorAddress,
          wrapNativeETH: isNativeETH,
        });
      }

      successes.push({
        walletAddress: walletAddress as string,
        type,
        tokenSymbol: deposit.tokenSymbol,
        amount: amountStr,
        sourceChain,
        destChain,
        hash: result.hash,
        meescanUrl: `https://meescan.biconomy.io/details/${result.hash}`,
      });

      // Track bridge_executed in PostHog
      const posthog = getPostHogClient();
      posthog.capture({
        distinctId: walletAddress as string,
        event: "bridge_executed",
        properties: {
          wallet_address: walletAddress as string,
          type,
          token_symbol: deposit.tokenSymbol,
          amount: amountStr,
          source_chain: sourceChain,
          source_chain_id: deposit.chainId,
          dest_chain: destChain,
          dest_chain_id: destChainId,
          tx_hash: result.hash,
          meescan_url: `https://meescan.biconomy.io/details/${result.hash}`,
          recipient_is_self: recipientIsSelf,
          source: "cron",
        },
      });

      // Record in history
      await addHistoryEntry(walletAddress, {
        timestamp: new Date().toISOString(),
        type,
        status: "success",
        hash: result.hash,
        tokenSymbol: deposit.tokenSymbol,
        amount: String(deposit.amount),
        sourceChainId: deposit.chainId,
        destChainId: isOnDestChain ? deposit.chainId : destChainId,
        recipient,
      });

      // If first tx used ENABLE_AND_USE, wait for it to mine before
      // submitting subsequent txs so they can use plain USE mode.
      if (
        i === 0 &&
        !permissionsPreEnabled &&
        actionableDeposits.length > 1
      ) {
        await waitForSupertxMined(result.hash);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      failures.push({
        walletAddress: walletAddress as string,
        type,
        tokenSymbol: deposit.tokenSymbol,
        amount: amountStr,
        sourceChain,
        destChain,
        error: msg,
      });

      // Track bridge_failed in PostHog
      const posthog = getPostHogClient();
      posthog.capture({
        distinctId: walletAddress as string,
        event: "bridge_failed",
        properties: {
          wallet_address: walletAddress as string,
          type,
          token_symbol: deposit.tokenSymbol,
          amount: amountStr,
          source_chain: sourceChain,
          source_chain_id: deposit.chainId,
          dest_chain: destChain,
          dest_chain_id: destChainId,
          error: msg,
          recipient_is_self: recipientIsSelf,
          source: "cron",
        },
      });

      // Record failure in history
      await addHistoryEntry(walletAddress, {
        timestamp: new Date().toISOString(),
        type,
        status: "error",
        error: msg,
        tokenSymbol: deposit.tokenSymbol,
        amount: String(deposit.amount),
        sourceChainId: deposit.chainId,
        destChainId: isOnDestChain ? deposit.chainId : destChainId,
        recipient,
      });
    }
  }

  return { successes, failures };
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

  // ── Phase 1: Fetch all records in parallel ─────────────────────────
  const recordPairs = await Promise.all(
    addresses.map(async (addr) => ({
      addr,
      record: await getSession(addr),
    })),
  );

  const allActive = recordPairs.filter(
    (p): p is { addr: string; record: SessionRecord } =>
      p.record !== null && p.record !== undefined && p.record.active,
  );

  if (allActive.length === 0) {
    console.log(`\n  ${c.dim("No active sessions — nothing to do")}`);
    console.log(footer());
    return { processed: 0, bridged: [], errors: [] };
  }

  // Filter out sessions with stale permission sets
  const staleRecords = allActive.filter(
    (p) => (p.record.sessionVersion ?? 0) < SESSION_VERSION,
  );
  const activeRecords = allActive.filter(
    (p) => (p.record.sessionVersion ?? 0) >= SESSION_VERSION,
  );

  if (staleRecords.length > 0) {
    console.log(
      `\n  ⚠️  ${c.boldYellow(`${staleRecords.length} session(s) skipped — stale permission set (need v${SESSION_VERSION}):`)}`,
    );
    for (const { addr, record } of staleRecords) {
      console.log(
        `    ${c.yellow("↳")} ${c.cyan(shortAddr(addr))}  v${record.sessionVersion ?? "?"}  — user must re-setup session`,
      );
    }
  }

  if (activeRecords.length === 0) {
    console.log(`\n  ${c.dim("No sessions with current permissions — nothing to do")}`);
    console.log(footer());
    return { processed: 0, bridged: [], errors: [] };
  }

  // ── Phase 2: Check all balances in parallel ────────────────────────
  const scanStart = Date.now();

  const walletScans: WalletScan[] = await Promise.all(
    activeRecords.map(async ({ addr, record }) => {
      const walletAddress = record.walletAddress as Address;
      const { destChainId, recipientIsSelf } = record.listeningConfig;

      const sourceChainIds = SUPPORTED_CHAINS.filter(
        (ch) => ch.id !== destChainId,
      ).map((ch) => ch.id);

      const watchedChainIds = recipientIsSelf
        ? sourceChainIds
        : [...sourceChainIds, destChainId];

      const checkResult = await checkBalances(walletAddress, watchedChainIds);

      const actionableDeposits = checkResult.deposits.filter(
        (dep) => !(dep.chainId === destChainId && recipientIsSelf),
      );

      return {
        addr,
        record,
        checkResult,
        watchedChainIds,
        actionableDeposits,
      };
    }),
  );

  const scanElapsed = Date.now() - scanStart;

  // ── Phase 3: Log balance overview for all accounts ─────────────────
  console.log(
    `\n  📋 ${c.bold(String(walletScans.length))} account(s) scanned ${c.dim(`(${fmtMs(scanElapsed)})`)}\n`,
  );

  const walletsNeedingAction: WalletScan[] = [];

  for (const scan of walletScans) {
    const { addr, record, checkResult, actionableDeposits } = scan;
    const { destChainId, recipientIsSelf, recipientAddr, recipientTokenSymbol: rts } =
      record.listeningConfig;
    const recipientDisplay = recipientIsSelf
      ? "self"
      : shortAddr(recipientAddr);
    const tokenTag = rts ? ` [${rts}]` : "";

    const addrStr = c.cyan(shortAddr(addr));
    const destStr = `→ ${chainName(destChainId)}${tokenTag} (${recipientDisplay})`;

    if (checkResult.entries.length === 0) {
      // No balances at all
      console.log(
        `  ${c.dim("·")} ${addrStr}  ${c.dim(destStr)}  ${c.dim("— no balances")}`,
      );
    } else if (actionableDeposits.length === 0) {
      // Has balances but nothing actionable
      const balSummary = checkResult.entries
        .map(
          (e) =>
            `${e.formatted} ${e.tokenSymbol} on ${e.chainLabel}${e.aboveThreshold ? " (home)" : ""}`,
        )
        .join(c.dim(", "));
      console.log(
        `  ${c.green("✓")} ${addrStr}  ${c.dim(destStr)}  ${c.dim("—")} ${c.dim(balSummary)}`,
      );
    } else {
      // Actionable deposits found
      const depSummary = actionableDeposits
        .map(
          (d) =>
            `${fmtToken(d.amount, d.tokenSymbol)} on ${chainName(d.chainId)}`,
        )
        .join(c.dim(", "));
      console.log(
        `  ${c.boldGreen("💰")} ${addrStr}  ${c.dim(destStr)}  — ${c.boldGreen(depSummary)}`,
      );
      walletsNeedingAction.push(scan);
    }
  }

  // ── Phase 4: Execute actions in parallel ───────────────────────────
  const result: PollResult = {
    processed: walletScans.length,
    bridged: [],
    errors: [],
  };

  // Update lastPollAt for all scanned wallets (parallel, fire-and-forget)
  await Promise.all(
    walletScans.map((scan) =>
      updateSession(scan.addr, { lastPollAt: new Date().toISOString() }),
    ),
  );

  if (walletsNeedingAction.length === 0) {
    console.log(`\n  ${c.dim("No actions needed this cycle.")}`);
    const totalElapsed = Date.now() - totalStart;
    console.log(
      summaryLine([
        ["Processed", result.processed],
        ["Bridged", 0],
        ["Errors", 0],
        ["Total", fmtMs(totalElapsed)],
      ]),
    );
    console.log(footer());
    return result;
  }

  // Fetch fee collector address once for the entire poll cycle
  const feeCollectorAddr = (await getFeeCollectorAddress()) as Address;

  console.log(
    `\n  ⚡ Executing ${c.bold(String(walletsNeedingAction.length))} wallet(s) in parallel…` +
      `  ${c.dim(`fee collector: ${shortAddr(feeCollectorAddr)}`)}\n`,
  );

  const execStart = Date.now();

  const execResults = await Promise.allSettled(
    walletsNeedingAction.map((scan) => executeWalletActions(scan, feeCollectorAddr)),
  );

  const execElapsed = Date.now() - execStart;

  // ── Phase 5: Collect & log results ─────────────────────────────────
  const allSuccesses: ActionSuccess[] = [];
  const allFailures: ActionFailure[] = [];

  for (let i = 0; i < walletsNeedingAction.length; i++) {
    const scan = walletsNeedingAction[i];
    const execResult = execResults[i];

    if (execResult.status === "fulfilled") {
      allSuccesses.push(...execResult.value.successes);
      allFailures.push(...execResult.value.failures);

      for (const s of execResult.value.successes) {
        result.bridged.push({ walletAddress: scan.addr, hash: s.hash });
      }
      for (const f of execResult.value.failures) {
        result.errors.push({ walletAddress: scan.addr, error: f.error });
      }
    } else {
      // Entire wallet processing threw
      const msg =
        execResult.reason instanceof Error
          ? execResult.reason.message
          : String(execResult.reason);
      result.errors.push({ walletAddress: scan.addr, error: msg });
      allFailures.push({
        walletAddress: scan.addr,
        type: "bridge",
        tokenSymbol: "?",
        amount: "?",
        sourceChain: "?",
        destChain: "?",
        error: msg,
      });
    }
  }

  // ── Successes ──────────────────────────────────────────────────────
  if (allSuccesses.length > 0) {
    console.log(
      `  ${c.boldGreen(`✅ ${allSuccesses.length} successful action(s):`)}`,
    );
    for (const s of allSuccesses) {
      console.log(
        `    ${c.green("↳")} ${c.cyan(shortAddr(s.walletAddress))}  ${s.type}  ${c.white(s.amount)}  ${s.sourceChain} → ${s.destChain}`,
      );
      console.log(`      ${c.yellow(s.hash)}`);
      console.log(`      ${c.dim(s.meescanUrl)}`);
    }
  }

  // ── Failures ───────────────────────────────────────────────────────
  if (allFailures.length > 0) {
    console.log(
      `\n  ${c.boldRed(`❌ ${allFailures.length} failed action(s):`)}`,
    );
    for (const f of allFailures) {
      console.log(
        `    ${c.red("↳")} ${c.cyan(shortAddr(f.walletAddress))}  ${f.type}  ${f.amount}  ${f.sourceChain} → ${f.destChain}`,
      );
      console.log(`      ${c.red(f.error)}`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────
  const totalElapsed = Date.now() - totalStart;

  console.log(
    summaryLine([
      ["Processed", result.processed],
      ["Bridged", result.bridged.length],
      ["Errors", result.errors.length],
      ["Scan", fmtMs(scanElapsed)],
      ["Exec", fmtMs(execElapsed)],
      ["Total", fmtMs(totalElapsed)],
    ]),
  );
  console.log(footer());

  return result;
}
