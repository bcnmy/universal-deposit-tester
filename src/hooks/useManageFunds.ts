import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useWallets } from "@privy-io/react-auth";
import {
  erc20Abi,
  createPublicClient,
  type Address,
} from "viem";
import {
  type MultichainSmartAccount,
  runtimeERC20BalanceOf,
  greaterThanOrEqualTo,
} from "@biconomy/abstractjs";
import {
  SUPPORTED_CHAINS,
  SUPPORTED_TOKENS,
  TOKEN_SYMBOLS,
  getTransport,
} from "../config";
import { createSessionMeeClient } from "../sessions";
import { ScheduledExecutionBounds } from "../sessions/getScheduledExecutionBounds";
import { formatTokenBySymbol } from "../utils";
import type { Status } from "../types";

const POLL_INTERVAL = 15_000;

/** Symbol used for native ETH in balances/sweep maps (not in SUPPORTED_TOKENS) */
export const NATIVE_ETH_SYMBOL = "ETH";

/** All symbols the sweep UI cares about: ERC-20 tokens + native ETH */
export const SWEEP_SYMBOLS = [...TOKEN_SYMBOLS, NATIVE_ETH_SYMBOL];

/** Per-token minimum sweep thresholds */
const MIN_SWEEP_AMOUNTS: Record<string, bigint> = {
  USDC: 100_000n, // 0.1 USDC
  USDT: 100_000n, // 0.1 USDT
  WETH: 10_000_000_000_000n, // 0.00001 WETH
  [NATIVE_ETH_SYMBOL]: 10_000_000_000_000n, // 0.00001 ETH
};
const DEFAULT_MIN_SWEEP = 100_000n;

export type SweepRecord = {
  chainId: number;
  recipient: string;
  tokens: { symbol: string; amount: string }[];
  txHash: string;
  timestamp: number;
};

/**
 * Hook for the "Manage Funds" page.
 *
 * - Fetches balances for **all tokens + native ETH** on **all supported chains**.
 * - Displays per-chain totals and lets the user pick a chain.
 * - ERC-20 tokens are swept via `.buildComposable()` with `runtimeERC20BalanceOf`
 *   so the actual on-chain balance is injected at execution time. Gas is paid
 *   with `feeToken` (the first sweepable ERC-20).
 * - Native ETH is swept as a **separate** sponsored `.build()` transaction
 *   (the current contract version does not support `runtimeNativeBalanceOf`).
 */
export function useManageFunds() {
  const { wallets } = useWallets();

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");

  // ─── Chain selection ───────────────────────────────────────────
  const [selectedChainId, setSelectedChainId] = useState<number>(
    SUPPORTED_CHAINS[0].id,
  );

  // ─── Balances: chainId → tokenSymbol → balance ─────────────────
  const [balances, setBalances] = useState<
    Record<number, Record<string, bigint>>
  >({});
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);

  // ─── Form state ────────────────────────────────────────────────
  const [recipient, setRecipient] = useState("");

  // ─── Sweep state ───────────────────────────────────────────────
  const [sweepStatus, setSweepStatus] = useState<Status>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sweeps, setSweeps] = useState<SweepRecord[]>([]);

  // ─── MEE refs (lazy-created on first sweep) ────────────────────
  const meeClientRef = useRef<any>(null);
  const mcAccountRef = useRef<MultichainSmartAccount | null>(null);

  // ═══════════════════════════════════════════════════════════════
  //  Balance polling — fetches ALL token balances on ALL chains
  // ═══════════════════════════════════════════════════════════════

  const fetchBalances = useCallback(async () => {
    if (!embeddedWallet) return;
    setIsLoadingBalances(true);

    const newBalances: Record<number, Record<string, bigint>> = {};
    const tasks: Promise<void>[] = [];

    for (const chain of SUPPORTED_CHAINS) {
      newBalances[chain.id] = {};
      const client = createPublicClient({ chain, transport: getTransport(chain) });

      // Fetch native ETH balance
      tasks.push(
        client
          .getBalance({ address: embeddedWallet.address as Address })
          .then((balance) => {
            newBalances[chain.id][NATIVE_ETH_SYMBOL] = balance;
          })
          .catch(() => {
            newBalances[chain.id][NATIVE_ETH_SYMBOL] = 0n;
          }),
      );

      // Fetch ERC-20 balances
      for (const [symbol, config] of Object.entries(SUPPORTED_TOKENS)) {
        const tokenAddr = config.addresses[chain.id];
        if (!tokenAddr) {
          newBalances[chain.id][symbol] = 0n;
          continue;
        }

        tasks.push(
          client
            .readContract({
              address: tokenAddr,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [embeddedWallet.address as Address],
            })
            .then((balance) => {
              newBalances[chain.id][symbol] = balance;
            })
            .catch(() => {
              newBalances[chain.id][symbol] = 0n;
            }),
        );
      }
    }

    await Promise.all(tasks);
    setBalances(newBalances);
    setIsLoadingBalances(false);
  }, [embeddedWallet]);

  useEffect(() => {
    if (!embeddedWallet) return;
    fetchBalances();
    const interval = setInterval(fetchBalances, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [embeddedWallet, fetchBalances]);

  // ═══════════════════════════════════════════════════════════════
  //  Derived — balances for the selected chain + sweepable tokens
  // ═══════════════════════════════════════════════════════════════

  const chainBalances = balances[selectedChainId] ?? {};

  const sweepableTokens = useMemo(
    () =>
      SWEEP_SYMBOLS.filter((sym) => {
        const bal = chainBalances[sym] ?? 0n;
        const min = MIN_SWEEP_AMOUNTS[sym] ?? DEFAULT_MIN_SWEEP;
        return bal >= min;
      }),
    [chainBalances],
  );

  // ═══════════════════════════════════════════════════════════════
  //  Sweep handler — batch sweep all tokens on the selected chain
  // ═══════════════════════════════════════════════════════════════

  const handleSweep = useCallback(async () => {
    if (!embeddedWallet || !recipient || sweepableTokens.length === 0) return;

    setSweepStatus("loading");
    setError(null);
    setTxHash(null);

    try {
      const address = embeddedWallet.address as `0x${string}`;

      // 1. Lazy-create MEE client + multichain account
      if (!meeClientRef.current || !mcAccountRef.current) {
        const provider = await embeddedWallet.getEthereumProvider();
        const { mcAccount, meeClient } = await createSessionMeeClient(
          provider,
          address,
        );
        meeClientRef.current = meeClient;
        mcAccountRef.current = mcAccount;
      }

      const account = mcAccountRef.current!;
      const mee = meeClientRef.current;

      // 2. Split sweepable tokens: ERC-20s vs native ETH
      const erc20Tokens = sweepableTokens.filter(
        (sym) => sym !== NATIVE_ETH_SYMBOL,
      );
      const hasNativeETH = sweepableTokens.includes(NATIVE_ETH_SYMBOL);

      // Build both sweeps concurrently, then settle with Promise.allSettled
      // so one failure doesn't block the other.
      const sweepPromises: Promise<string>[] = [];

      // ────────────────────────────────────────────────────────────
      //  ERC-20 sweep (composable + runtime balance + feeToken)
      // ────────────────────────────────────────────────────────────
      if (erc20Tokens.length > 0) {
        sweepPromises.push(
          (async () => {
            const smartAccountAddress = account.addressOn(
              selectedChainId,
              true,
            );

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const composableInstructions: any[] = [];
            const erc20SweptTokens: { symbol: string; amount: string }[] = [];

            for (const sym of erc20Tokens) {
              const config = SUPPORTED_TOKENS[sym];
              const tokenAddr = config.addresses[selectedChainId];
              if (!tokenAddr) continue;

              const instruction = await account.buildComposable({
                type: "transfer",
                data: {
                  tokenAddress: tokenAddr,
                  amount: runtimeERC20BalanceOf({
                    targetAddress: smartAccountAddress,
                    tokenAddress: tokenAddr,
                    constraints: [
                      greaterThanOrEqualTo(
                        MIN_SWEEP_AMOUNTS[sym] ?? DEFAULT_MIN_SWEEP,
                      ),
                    ],
                  }),
                  recipient: recipient as Address,
                  chainId: selectedChainId,
                },
              });

              composableInstructions.push(...instruction);
              erc20SweptTokens.push({
                symbol: sym,
                amount: formatTokenBySymbol(chainBalances[sym] ?? 0n, sym),
              });
            }

            const feeTokenAddress =
              SUPPORTED_TOKENS[erc20Tokens[0]].addresses[selectedChainId];

            const quote = await mee.getQuote({
              instructions: composableInstructions,
              delegate: true,
              feeToken: {
                address: feeTokenAddress,
                chainId: selectedChainId,
              },
              simulation: { simulate: true },
              ...ScheduledExecutionBounds,
            });

            const signedQuote = await mee.signQuote({ quote });
            const result = await mee.executeSignedQuote({ signedQuote });
            await mee.waitForSupertransactionReceipt({ hash: result.hash });

            setSweeps((prev) => [
              {
                chainId: selectedChainId,
                recipient,
                tokens: erc20SweptTokens,
                txHash: result.hash,
                timestamp: Date.now(),
              },
              ...prev,
            ]);

            for (const swept of erc20SweptTokens) {
              const bal = chainBalances[swept.symbol] ?? 0n;
              fetch(`/api/history/${address}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  timestamp: new Date().toISOString(),
                  type: "sweep",
                  status: "success",
                  hash: result.hash,
                  tokenSymbol: swept.symbol,
                  amount: String(bal),
                  sourceChainId: selectedChainId,
                  destChainId: selectedChainId,
                  recipient,
                }),
              }).catch((err) => {
                console.error("Failed to persist sweep history entry:", err);
              });
            }

            return result.hash;
          })(),
        );
      }

      // ────────────────────────────────────────────────────────────
      //  Native ETH sweep (separate tx, .build, sponsored)
      // ────────────────────────────────────────────────────────────
      if (hasNativeETH) {
        sweepPromises.push(
          (async () => {
            const ethBal = chainBalances[NATIVE_ETH_SYMBOL] ?? 0n;

            const instructions = await account.build({
              type: "nativeTokenTransfer",
              data: {
                to: recipient as Address,
                value: ethBal,
                chainId: selectedChainId,
              },
            });

            const quote = await mee.getQuote({
              instructions,
              delegate: true,
              sponsorship: true,
              simulation: { simulate: true },
              ...ScheduledExecutionBounds,
            });

            const signedQuote = await mee.signQuote({ quote });
            const result = await mee.executeSignedQuote({ signedQuote });
            await mee.waitForSupertransactionReceipt({ hash: result.hash });

            const ethSweptToken = {
              symbol: NATIVE_ETH_SYMBOL,
              amount: formatTokenBySymbol(ethBal, NATIVE_ETH_SYMBOL),
            };

            setSweeps((prev) => [
              {
                chainId: selectedChainId,
                recipient,
                tokens: [ethSweptToken],
                txHash: result.hash,
                timestamp: Date.now(),
              },
              ...prev,
            ]);

            fetch(`/api/history/${address}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                timestamp: new Date().toISOString(),
                type: "sweep",
                status: "success",
                hash: result.hash,
                tokenSymbol: NATIVE_ETH_SYMBOL,
                amount: String(ethBal),
                sourceChainId: selectedChainId,
                destChainId: selectedChainId,
                recipient,
              }),
            }).catch((err) => {
              console.error("Failed to persist sweep history entry:", err);
            });

            return result.hash;
          })(),
        );
      }

      // Run both supertransactions in parallel
      const results = await Promise.allSettled(sweepPromises);

      const hashes = results
        .filter(
          (r): r is PromiseFulfilledResult<string> => r.status === "fulfilled",
        )
        .map((r) => r.value);

      const failures = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );

      if (hashes.length === 0) {
        // All failed — rethrow the first error
        throw failures[0].reason;
      }

      if (failures.length > 0) {
        console.error("Partial sweep failure:", failures[0].reason);
      }

      setTxHash(hashes[0]);
      setSweepStatus("success");

      // Refresh balances
      fetchBalances();
    } catch (err) {
      console.error("Failed to sweep tokens:", err);
      setError(
        err instanceof Error ? err.message : "Failed to sweep tokens",
      );
      setSweepStatus("error");
    }
  }, [
    embeddedWallet,
    recipient,
    selectedChainId,
    chainBalances,
    sweepableTokens,
    fetchBalances,
  ]);

  const resetSweep = useCallback(() => {
    setSweepStatus("idle");
    setTxHash(null);
    setError(null);
  }, []);

  return {
    walletAddress: embeddedWallet?.address,

    // Chain
    selectedChainId,
    setSelectedChainId,

    // Balances (all chains, all tokens)
    balances,
    chainBalances,
    isLoadingBalances,
    refreshBalances: fetchBalances,

    // Form
    recipient,
    setRecipient,

    // Sweep
    sweepableTokens,
    sweepStatus,
    txHash,
    error,
    sweeps,
    handleSweep,
    resetSweep,
  };
}
