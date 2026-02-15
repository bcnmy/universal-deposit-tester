import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useWallets } from "@privy-io/react-auth";
import {
  erc20Abi,
  createPublicClient,
  type Address,
} from "viem";
import { type MultichainSmartAccount } from "@biconomy/abstractjs";
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
 * - Sweeps all tokens + native ETH on the selected chain in a **single batch**
 *   supertransaction via the user's Privy wallet (no session keys).
 * - Uses static amounts from the fetched balances (no composability).
 * - Gas is sponsored, so no fee token is needed.
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

      // 2. Build transfer instructions for each sweepable token (no composability)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allInstructions: any[] = [];
      const sweptTokens: { symbol: string; amount: string }[] = [];

      for (const sym of sweepableTokens) {
        const bal = chainBalances[sym] ?? 0n;

        if (sym === NATIVE_ETH_SYMBOL) {
          // ── Native ETH: plain value transfer ──
          const instructions = await mcAccountRef.current!.build({
            type: "nativeTokenTransfer",
            data: {
              to: recipient as Address,
              value: bal,
              chainId: selectedChainId,
            },
          });

          allInstructions.push(...instructions);
          sweptTokens.push({
            symbol: sym,
            amount: formatTokenBySymbol(bal, sym),
          });
        } else {
          // ── ERC-20: standard transfer ──
          const config = SUPPORTED_TOKENS[sym];
          const tokenAddr = config.addresses[selectedChainId];
          if (!tokenAddr) continue;

          const instructions = await mcAccountRef.current!.build({
            type: "transfer",
            data: {
              tokenAddress: tokenAddr,
              amount: bal,
              recipient: recipient as Address,
              chainId: selectedChainId,
            },
          });

          allInstructions.push(...instructions);
          sweptTokens.push({
            symbol: sym,
            amount: formatTokenBySymbol(bal, sym),
          });
        }
      }

      // 3. Get quote — gas is sponsored
      const quote = await meeClientRef.current.getQuote({
        instructions: allInstructions,
        delegate: true,
        sponsorship: true,
        simulation: { simulate: true },
        ...ScheduledExecutionBounds,
      });

      // 4. Sign and execute
      const signedQuote = await meeClientRef.current.signQuote({ quote });
      const result = await meeClientRef.current.executeSignedQuote({
        signedQuote,
      });

      // 5. Wait for receipt
      await meeClientRef.current.waitForSupertransactionReceipt({
        hash: result.hash,
      });

      setTxHash(result.hash);
      setSweepStatus("success");

      // Record the sweep in local state
      setSweeps((prev) => [
        {
          chainId: selectedChainId,
          recipient,
          tokens: sweptTokens,
          txHash: result.hash,
          timestamp: Date.now(),
        },
        ...prev,
      ]);

      // Persist each swept token as a history entry
      for (const swept of sweptTokens) {
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
