import type { ActionData } from "@rhinestone/module-sdk";
import { toFunctionSelector, getAbiItem, erc20Abi } from "viem";
import { ACROSS_SPOKEPOOL, USDC, DEPOSIT_V3_ABI } from "../config";
import { buildDepositV3Policy } from "./buildDepositV3Policy";

export function buildDepositV3Actions(
  chainIds: number[]
): (ActionData & { chainId: number })[] {
  const policy = buildDepositV3Policy();
  const depositSelector = toFunctionSelector(
    getAbiItem({ abi: DEPOSIT_V3_ABI, name: "depositV3" })
  );
  const approveSelector = toFunctionSelector(
    getAbiItem({ abi: erc20Abi, name: "approve" })
  );
  const transferSelector = toFunctionSelector(
    getAbiItem({ abi: erc20Abi, name: "transfer" })
  );

  const supported = chainIds.filter((id) => ACROSS_SPOKEPOOL[id] && USDC[id]);

  return supported.flatMap((chainId) => [
    // Allow approve on USDC (so SpokePool can spend it)
    {
      actionTarget: USDC[chainId],
      actionTargetSelector: approveSelector,
      actionPolicies: [policy],
      chainId,
    },
    // Allow transfer on USDC (needed for MEE fee payment)
    {
      actionTarget: USDC[chainId],
      actionTargetSelector: transferSelector,
      actionPolicies: [policy],
      chainId,
    },
    // Allow depositV3 on the SpokePool
    {
      actionTarget: ACROSS_SPOKEPOOL[chainId],
      actionTargetSelector: depositSelector,
      actionPolicies: [policy],
      chainId,
    },
  ]);
}

