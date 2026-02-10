import { meeSessionActions } from "@biconomy/abstractjs";
import type { Address } from "viem";
import { USDC } from "../config";
import { buildDepositV3Actions } from "./buildDepositV3Actions";

export async function grantDepositV3Permission(params: {
  sessionMeeClient: ReturnType<typeof meeSessionActions> & any;
  sessionSignerAddress: Address;
  chainIds: number[];
  /** Chain ID to use for fee payment */
  feeChainId: number;
}) {
  const { sessionMeeClient, sessionSignerAddress, chainIds, feeChainId } = params;

  const actions = buildDepositV3Actions(chainIds);

  const sessionDetails = await sessionMeeClient.grantPermissionTypedDataSign({
    redeemer: sessionSignerAddress,
    actions,
    sponsored: true,
    
  });

  return sessionDetails;
}
