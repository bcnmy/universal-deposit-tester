import {
  toSmartSessionsModule,
  meeSessionActions,
} from "@biconomy/abstractjs";
import type { SignAuthorizationReturnType } from "viem/accounts";

export async function installSessionModule(params: {
  sessionMeeClient: ReturnType<typeof meeSessionActions> & any;
  smartSessionsValidator: ReturnType<typeof toSmartSessionsModule>;
  authorization: SignAuthorizationReturnType;
}) {
  const { sessionMeeClient, smartSessionsValidator, authorization } = params;

  const payload = await sessionMeeClient.prepareForPermissions({
    smartSessionsValidator,
    sponsorship: true,
    delegate: true,
    authorizations: [authorization],
    multichain7702Auth: true,
  });

  if (payload) {
    const receipt = await sessionMeeClient.waitForSupertransactionReceipt({
      hash: payload.hash,
    });
    return receipt;
  }

  // Module already installed, no tx needed
  return null;
}
