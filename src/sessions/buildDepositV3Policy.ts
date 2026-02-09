import { ParamCondition } from "@biconomy/abstractjs";
import { getUniversalActionPolicy } from "@rhinestone/module-sdk";
import { maxUint256, pad } from "viem";

const EMPTY_PARAM_RULE = {
  condition: ParamCondition.EQUAL,
  offset: 0n,
  isLimited: false,
  ref: pad("0x00", { size: 32 }),
  usage: { limit: 0n, used: 0n },
} as const;

function makeEmptyRules() {
  return Array.from({ length: 16 }, () => ({ ...EMPTY_PARAM_RULE }));
}

export function buildDepositV3Policy() {
  return getUniversalActionPolicy({
    valueLimitPerUse: maxUint256,
    paramRules: {
      length: 0n, // no parameter restrictions — just allow the function
      rules: makeEmptyRules() as any, // 16 placeholder rules required
    },
  });
}

