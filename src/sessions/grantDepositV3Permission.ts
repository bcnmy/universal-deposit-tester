import { meeSessionActions } from "@biconomy/abstractjs";
import { parseUnits, type Address } from "viem";
import { USDC } from "../config";
import { buildDepositV3Actions } from "./buildDepositV3Actions";

export async function grantDepositV3Permission(params: {
  sessionMeeClient: ReturnType<typeof meeSessionActions> & any;
  sessionSignerAddress: Address;
  chainIds: number[];
  /** Chain ID to use for fee payment */
  feeChainId: number;
  /** Maximum payment amount for fee token (defaults to 2 USDC) */
  maxPaymentAmount?: bigint;
}) {
  const {
    sessionMeeClient,
    sessionSignerAddress,
    chainIds,
    feeChainId,
    maxPaymentAmount = parseUnits("2", 6),
  } = params;

  const actions = buildDepositV3Actions(chainIds);

  const sessionDetails = await sessionMeeClient.grantPermissionTypedDataSign({
    redeemer: sessionSignerAddress,
    actions,
    feeToken: {
      address: USDC[feeChainId],
      chainId: feeChainId,
    },
    maxPaymentAmount,
  });

  return sessionDetails;
}
