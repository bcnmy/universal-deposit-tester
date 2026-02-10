import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  useWallets,
  useSign7702Authorization,
} from "@privy-io/react-auth";
import {
  erc20Abi,
  createPublicClient,
  http,
  type Address,
} from "viem";
import type { SignAuthorizationReturnType } from "viem/accounts";
import {
  runtimeERC20BalanceOf,
  greaterThanOrEqualTo,
  type MultichainSmartAccount,
} from "@biconomy/abstractjs";
import {
  SUPPORTED_CHAINS,
  USDC,
  SUPPORTED_TOKENS,
  TOKEN_SYMBOLS,
  NEXUS_SINGLETON,
} from "../config";
import { createSessionMeeClient } from "../sessions";
import { ScheduledExecutionBounds } from "../sessions/getScheduledExecutionBounds";
import { formatTokenBySymbol } from "../utils";
import type { Status } from "../types";

const POLL_INTERVAL = 15_000;

/** Per-token minimum sweep thresholds */
const MIN_SWEEP_AMOUNTS: Record<string, bigint> = {
  USDC: 100_000n, // 0.1 USDC
  USDT: 100_000n, // 0.1 USDT
  WETH: 10_000_000_000_000n, // 0.00001 WETH
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
 * - Fetches balances for **all tokens** on **all supported chains**.
 * - Displays per-chain totals and lets the user pick a chain.
 * - Sweeps all tokens on the selected chain in a **single batch**
 *   supertransaction via the user's Privy wallet (no session keys).
 * - Uses **runtime parameter injection** (`runtimeERC20BalanceOf`) so
 *   transfer amounts are resolved at execution time — after gas is deducted.
 * - Gas is paid with USDC (`feeToken`), so no native tokens are needed.
 */
export function useManageFunds() {
  const { wallets } = useWallets();
  const { signAuthorization } = useSign7702Authorization();

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
      const client = createPublicClient({ chain, transport: http() });

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
      TOKEN_SYMBOLS.filter((sym) => {
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

      // 2. Sign fresh 7702 authorization
      const auth = await signAuthorization(
        { contractAddress: NEXUS_SINGLETON, chainId: 0 },
        { address: embeddedWallet.address },
      );

      // 3. Build composable transfer instructions for each sweepable token
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allInstructions: any[] = [];
      const sweptTokens: { symbol: string; amount: string }[] = [];

      for (const sym of sweepableTokens) {
        const config = SUPPORTED_TOKENS[sym];
        const tokenAddr = config.addresses[selectedChainId];
        if (!tokenAddr) continue;

        const bal = chainBalances[sym] ?? 0n;
        const minSweep = MIN_SWEEP_AMOUNTS[sym] ?? DEFAULT_MIN_SWEEP;

        const instructions = await mcAccountRef.current!.buildComposable({
          type: "default",
          data: {
            to: tokenAddr,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            abi: erc20Abi as any,
            functionName: "transfer",
            args: [
              recipient as Address,
              runtimeERC20BalanceOf({
                targetAddress: address,
                tokenAddress: tokenAddr,
                constraints: [greaterThanOrEqualTo(minSweep)],
              }),
            ],
            chainId: selectedChainId,
          },
        });

        allInstructions.push(...instructions);
        sweptTokens.push({
          symbol: sym,
          amount: formatTokenBySymbol(bal, sym),
        });
      }

      // 4. Get quote — gas paid with USDC on the selected chain
      const quote = await meeClientRef.current.getQuote({
        instructions: allInstructions,
        delegate: true,
        authorizations: [auth as SignAuthorizationReturnType],
        multichain7702Auth: true,
        feeToken: {
          address: USDC[selectedChainId],
          chainId: selectedChainId,
        },
        simulation: { simulate: true },
        ...ScheduledExecutionBounds,
      });

      // 5. Sign and execute
      const signedQuote = await meeClientRef.current.signQuote({ quote });
      const result = await meeClientRef.current.executeSignedQuote({
        signedQuote,
      });

      // 6. Wait for receipt
      await meeClientRef.current.waitForSupertransactionReceipt({
        hash: result.hash,
      });

      setTxHash(result.hash);
      setSweepStatus("success");

      // Record the sweep
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
    signAuthorization,
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
