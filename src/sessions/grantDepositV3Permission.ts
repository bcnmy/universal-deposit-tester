import { meeSessionActions } from "@biconomy/abstractjs";
import { type Address } from "viem";
import { buildDepositV3Actions } from "./buildDepositV3Actions";

export async function grantDepositV3Permission(params: {
  sessionMeeClient: ReturnType<typeof meeSessionActions> & any;
  sessionSignerAddress: Address;
  chainIds: number[];
}) {
  const {
    sessionMeeClient,
    sessionSignerAddress,
    chainIds,
  } = params;

  const actions = buildDepositV3Actions(chainIds);

  const sessionDetails = await sessionMeeClient.grantPermissionTypedDataSign({
    redeemer: sessionSignerAddress,
    actions,
    sponsorship: true,
  });

  return sessionDetails;
}
