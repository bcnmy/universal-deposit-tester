import { getSudoPolicy } from "@biconomy/abstractjs";
import { toFunctionSelector, getAbiItem, erc20Abi } from "viem";
import {
  ACROSS_SPOKEPOOL,
  ACROSS_SPOKEPOOL_PERIPHERY,
  SUPPORTED_TOKENS,
  DEPOSIT_V3_ABI,
  SWAP_API_DEPOSIT_SELECTOR,
  SWAP_API_PERIPHERY_SELECTOR,
  WETH,
} from "../config";

/** WETH deposit() selector — wraps native ETH into WETH (no arguments) */
const WETH_DEPOSIT_SELECTOR = "0xd0e30db0" as const;

/**
 * Build session permission actions for ALL supported tokens (USDC, USDT, WETH)
 * on the given chain IDs.
 *
 * For each chain we grant:
 *  - `approve` on every token address (so the SpokePool / Periphery can spend it)
 *  - `transfer` on every token address (for fee collection + forward transfers)
 *  - `depositV3` on the SpokePool (legacy, for direct calls)
 *  - The Swap API deposit function on the SpokePool (same-token routes via Swap API)
 *  - The swap+bridge function on the SpokePoolPeriphery (cross-token routes)
 */
export function buildDepositV3Actions(chainIds: number[]) {
  const depositV3Selector = toFunctionSelector(
    getAbiItem({ abi: DEPOSIT_V3_ABI, name: "depositV3" })
  );
  const approveSelector = toFunctionSelector(
    getAbiItem({ abi: erc20Abi, name: "approve" })
  );
  const transferSelector = toFunctionSelector(
    getAbiItem({ abi: erc20Abi, name: "transfer" })
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actions: any[] = [];

  const addedSpokepool = new Set<number>();

  for (const token of Object.values(SUPPORTED_TOKENS)) {
    const supported = chainIds.filter(
      (id) => ACROSS_SPOKEPOOL[id] && token.addresses[id],
    );

    for (const chainId of supported) {
      // Allow approve on this token (covers both SpokePool and Periphery as spender)
      actions.push({
        actionTarget: token.addresses[chainId],
        actionTargetSelector: approveSelector,
        actionPolicies: [getSudoPolicy()],
        chainId,
      });

      // Allow transfer on this token (fee collection + forward transfers)
      actions.push({
        actionTarget: token.addresses[chainId],
        actionTargetSelector: transferSelector,
        actionPolicies: [getSudoPolicy()],
        chainId,
      });

      // Per-chain permissions (added once regardless of token)
      if (!addedSpokepool.has(chainId)) {
        // Allow depositV3 on the SpokePool (legacy direct calls)
        actions.push({
          actionTarget: ACROSS_SPOKEPOOL[chainId],
          actionTargetSelector: depositV3Selector,
          actionPolicies: [getSudoPolicy()],
          chainId,
        });

        // Allow the Swap API deposit function on the SpokePool (same-token routes)
        actions.push({
          actionTarget: ACROSS_SPOKEPOOL[chainId],
          actionTargetSelector: SWAP_API_DEPOSIT_SELECTOR,
          actionPolicies: [getSudoPolicy()],
          chainId,
        });

        // Allow the swap+bridge function on the SpokePoolPeriphery (cross-token routes)
        actions.push({
          actionTarget: ACROSS_SPOKEPOOL_PERIPHERY,
          actionTargetSelector: SWAP_API_PERIPHERY_SELECTOR,
          actionPolicies: [getSudoPolicy()],
          chainId,
        });

        // Allow deposit() on the WETH contract (wraps native ETH → WETH)
        const wethAddr = WETH[chainId];
        if (wethAddr) {
          actions.push({
            actionTarget: wethAddr,
            actionTargetSelector: WETH_DEPOSIT_SELECTOR,
            actionPolicies: [getSudoPolicy()],
            chainId,
          });
        }

        addedSpokepool.add(chainId);
      }
    }
  }

  return actions;
}

