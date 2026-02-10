import {
  toSmartSessionsModule,
  meeSessionActions,
} from "@biconomy/abstractjs";
import type { Hash } from "viem";
import type { SignAuthorizationReturnType } from "viem/accounts";

export async function installSessionModule(params: {
  sessionMeeClient: ReturnType<typeof meeSessionActions> & any;
  smartSessionsValidator: ReturnType<typeof toSmartSessionsModule>;
  /** Optional 7702 authorization — when provided the EIP-7702 delegation
   *  is propagated on-chain in the same supertransaction that installs the
   *  sessions module, saving a separate deploy step. */
  authorization?: SignAuthorizationReturnType;
}): Promise<{ hash: Hash } | null> {
  const { sessionMeeClient, smartSessionsValidator, authorization } = params;

  const payload = await sessionMeeClient.prepareForPermissions({
    smartSessionsValidator,
    sponsorship: true,
    simulation: { simulate: true },
    // Piggy-back the 7702 auth so the delegation is activated on all chains
    // in the same supertransaction that installs the sessions module.
    ...(authorization
      ? {
          delegate: true,
          multichain7702Auth: true,
          authorizations: [authorization],
        }
      : {}),
  });

  if (payload) {
    await sessionMeeClient.waitForSupertransactionReceipt({
      hash: payload.hash,
    });
    return { hash: payload.hash };
  }

  // Module already installed, no tx needed
  return null;
}
