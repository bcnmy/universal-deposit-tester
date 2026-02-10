import { getSudoPolicy } from "@biconomy/abstractjs";
import { toFunctionSelector, getAbiItem, erc20Abi } from "viem";
import { ACROSS_SPOKEPOOL, SUPPORTED_TOKENS, DEPOSIT_V3_ABI } from "../config";

/**
 * Build session permission actions for ALL supported tokens (USDC, USDT, WETH)
 * on the given chain IDs.
 *
 * For each chain we grant:
 *  - `approve` on every token address (so the SpokePool can spend it)
 *  - `depositV3` on the SpokePool (once per chain — same contract regardless of token)
 */
export function buildDepositV3Actions(chainIds: number[]) {
  const depositSelector = toFunctionSelector(
    getAbiItem({ abi: DEPOSIT_V3_ABI, name: "depositV3" })
  );
  const approveSelector = toFunctionSelector(
    getAbiItem({ abi: erc20Abi, name: "approve" })
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actions: any[] = [];

  const addedSpokepool = new Set<number>();

  for (const token of Object.values(SUPPORTED_TOKENS)) {
    const supported = chainIds.filter(
      (id) => ACROSS_SPOKEPOOL[id] && token.addresses[id],
    );

    for (const chainId of supported) {
      // Allow approve on this token
      actions.push({
        actionTarget: token.addresses[chainId],
        actionTargetSelector: approveSelector,
        actionPolicies: [getSudoPolicy()],
        chainId,
      });

      // Allow depositV3 on the SpokePool (once per chain)
      if (!addedSpokepool.has(chainId)) {
        actions.push({
          actionTarget: ACROSS_SPOKEPOOL[chainId],
          actionTargetSelector: depositSelector,
          actionPolicies: [getSudoPolicy()],
          chainId,
        });
        addedSpokepool.add(chainId);
      }
    }
  }

  return actions;
}

