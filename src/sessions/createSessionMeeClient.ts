import {
  toMultichainNexusAccount,
  createMeeClient,
  meeSessionActions,
  getMEEVersion,
  MEEVersion,
} from "@biconomy/abstractjs";
import { type Address } from "viem";
import { SUPPORTED_CHAINS, BICONOMY_API_KEY, getTransport } from "../config";

/**
 * Creates a MEE client + session-extended MEE client for the given signer.
 *
 * - For the **user flow** (signing authorization, deploying, installing SS,
 *   granting permissions), pass the user's EOA provider as `signer`.
 * - For the **session-signer flow** (calling `usePermission`), pass the
 *   session `PrivateKeyAccount` as `signer`.
 *
 * In both cases `accountAddress` must be the user's EOA address (the
 * 7702-delegated Nexus account).
 */
export async function createSessionMeeClient(
  signer: any,
  walletAddress: Address,
) {
  const mcAccount = await toMultichainNexusAccount({
    signer,
    chainConfigurations: SUPPORTED_CHAINS.map((chain) => ({
      chain,
      transport: getTransport(chain),
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
