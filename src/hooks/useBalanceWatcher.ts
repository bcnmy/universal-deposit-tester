import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPublicClient, http, erc20Abi, type Address } from "viem";
import { SUPPORTED_CHAINS, SUPPORTED_TOKENS } from "../config";

const POLL_INTERVAL = 10_000; // 10 seconds

/** Per-token minimum bridge thresholds (avoids dust) */
const MIN_BRIDGE_AMOUNTS: Record<string, bigint> = {
  USDC: 100_000n,          // 0.1 USDC
  USDT: 100_000n,          // 0.1 USDT
  WETH: 10_000_000_000_000n, // 0.00001 WETH
};
const DEFAULT_MIN_BRIDGE = 100_000n;

export type DetectedDeposit = {
  chainId: number;
  tokenSymbol: string;
  amount: bigint;
};

/** Balances keyed by `${tokenSymbol}:${chainId}` */
export type TokenChainBalances = Record<string, bigint>;

/** Helper to build / read the composite key */
export const balanceKey = (symbol: string, chainId: number) =>
  `${symbol}:${chainId}`;

const chainById = Object.fromEntries(
  SUPPORTED_CHAINS.map((c) => [c.id, c]),
) as Record<number, (typeof SUPPORTED_CHAINS)[number]>;

/**
 * Polls balances for ALL supported tokens on the given chains.
 * When any watched chain has a balance above the minimum for any token
 * and no bridge is in progress, reports it as a `pendingDeposit`.
 */
export function useBalanceWatcher(
  walletAddress: Address | undefined,
  watchedChainIds: number[],
  enabled: boolean,
) {
  const [balances, setBalances] = useState<TokenChainBalances>({});
  const [pendingDeposit, setPendingDeposit] = useState<DetectedDeposit | null>(
    null,
  );
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const isBridgingRef = useRef(false);

  // Stable key for the watched chain list
  const watchKey = useMemo(
    () => [...watchedChainIds].sort().join(","),
    [watchedChainIds],
  );

  const clearDeposit = useCallback(() => {
    setPendingDeposit(null);
  }, []);

  const setBridging = useCallback((v: boolean) => {
    isBridgingRef.current = v;
    if (v) setPendingDeposit(null);
  }, []);

  useEffect(() => {
    if (!enabled || !walletAddress || watchedChainIds.length === 0) return;

    // Pre-build the list of (chainId, tokenSymbol, tokenAddress, client) combos
    const queries: {
      chainId: number;
      tokenSymbol: string;
      tokenAddress: Address;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: any;
    }[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientCache: Record<number, any> = {};

    for (const chainId of watchedChainIds) {
      const chain = chainById[chainId];
      if (!chain) continue;

      for (const token of Object.values(SUPPORTED_TOKENS)) {
        const addr = token.addresses[chainId];
        if (!addr) continue;

        if (!clientCache[chainId]) {
          clientCache[chainId] = createPublicClient({
            chain,
            transport: http(),
          });
        }

        queries.push({
          chainId,
          tokenSymbol: token.symbol,
          tokenAddress: addr,
          client: clientCache[chainId],
        });
      }
    }

    let cancelled = false;

    const poll = async () => {
      if (cancelled || isBridgingRef.current) return;

      const newBalances: TokenChainBalances = {};

      for (const { chainId, tokenSymbol, tokenAddress, client } of queries) {
        try {
          const balance = await client.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [walletAddress],
          });
          newBalances[balanceKey(tokenSymbol, chainId)] = balance;
        } catch (err) {
          console.warn(
            `Failed to read ${tokenSymbol} balance on chain ${chainId}:`,
            err,
          );
          newBalances[balanceKey(tokenSymbol, chainId)] = 0n;
        }
      }

      if (cancelled) return;

      setBalances(newBalances);
      setLastChecked(Date.now());

      // Check if any watched chain has a bridgeable balance for any token
      if (!isBridgingRef.current) {
        for (const chainId of watchedChainIds) {
          for (const tokenSymbol of Object.keys(SUPPORTED_TOKENS)) {
            const bal = newBalances[balanceKey(tokenSymbol, chainId)] ?? 0n;
            const min = MIN_BRIDGE_AMOUNTS[tokenSymbol] ?? DEFAULT_MIN_BRIDGE;
            if (bal >= min) {
              setPendingDeposit({ chainId, tokenSymbol, amount: bal });
              return; // handle one at a time
            }
          }
        }
      }
    };

    // Initial poll immediately
    poll();

    // Then poll at interval
    const interval = setInterval(poll, POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, walletAddress, watchKey]);

  return { balances, pendingDeposit, lastChecked, clearDeposit, setBridging };
}

