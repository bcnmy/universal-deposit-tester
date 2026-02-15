import {
  toSmartSessionsModule,
  meeSessionActions,
} from "@biconomy/abstractjs";
import type { Hash } from "viem";
import type { SignAuthorizationReturnType } from "viem/accounts";

export async function installSessionModule(params: {
  sessionMeeClient: ReturnType<typeof meeSessionActions> & any;
  smartSessionsValidator: ReturnType<typeof toSmartSessionsModule>;
  authorizations: SignAuthorizationReturnType[];
}): Promise<{ hash: Hash } | null> {
  const { sessionMeeClient, smartSessionsValidator, authorizations } = params;

  if (!authorizations.length) {
    throw new Error("installSessionModule requires at least one 7702 authorization");
  }

  const payload = await sessionMeeClient.prepareForPermissions({
    smartSessionsValidator,
    sponsorship: true,
    simulation: { simulate: true },
    delegate: true,
    multichain7702Auth: true,
    authorizations,
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
