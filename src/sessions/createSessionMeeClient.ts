import {
  toMultichainNexusAccount,
  createMeeClient,
  meeSessionActions,
  getMEEVersion,
  MEEVersion,
} from "@biconomy/abstractjs";
import { http, type Address } from "viem";
import type { SignAuthorizationReturnType } from "viem/accounts";
import { SUPPORTED_CHAINS, BICONOMY_API_KEY } from "../config";

export async function createSessionMeeClient(
  provider: any,
  walletAddress: Address,
  authorization: SignAuthorizationReturnType
) {
  const mcAccount = await toMultichainNexusAccount({
    signer: provider,
    chainConfigurations: SUPPORTED_CHAINS.map((chain) => ({
      chain,
      transport: http(),
      version: getMEEVersion(MEEVersion.V2_1_0),
      accountAddress: walletAddress,
    })),
  });

  const meeClient = await createMeeClient({
    account: mcAccount,
    apiKey: BICONOMY_API_KEY,
  });
  const sessionMeeClient = meeClient.extend(meeSessionActions);

  return { mcAccount, meeClient, sessionMeeClient };
}
