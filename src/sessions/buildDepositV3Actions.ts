import type { ActionData } from "@rhinestone/module-sdk";
import { toFunctionSelector, getAbiItem } from "viem";
import { ACROSS_SPOKEPOOL, DEPOSIT_V3_ABI } from "../config";
import { buildDepositV3Policy } from "./buildDepositV3Policy";

export function buildDepositV3Actions(
  chainIds: number[]
): (ActionData & { chainId: number })[] {
  const policy = buildDepositV3Policy();
  const selector = toFunctionSelector(
    getAbiItem({ abi: DEPOSIT_V3_ABI, name: "depositV3" })
  );

  return chainIds
    .filter((id) => ACROSS_SPOKEPOOL[id])
    .map((chainId) => ({
      actionTarget: ACROSS_SPOKEPOOL[chainId],
      actionTargetSelector: selector,
      actionPolicies: [policy],
      chainId,
    }));
}

