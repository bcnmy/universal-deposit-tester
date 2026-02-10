import {
  toSmartSessionsModule,
  meeSessionActions,
} from "@biconomy/abstractjs";
import type { Hash } from "viem";
import { arbitrum } from "viem/chains";
import { USDC } from "../config";

export async function installSessionModule(params: {
  sessionMeeClient: ReturnType<typeof meeSessionActions> & any;
  smartSessionsValidator: ReturnType<typeof toSmartSessionsModule>;
}): Promise<{ hash: Hash } | null> {
  const { sessionMeeClient, smartSessionsValidator } = params;

  const payload = await sessionMeeClient.prepareForPermissions({
    smartSessionsValidator,
    feeToken: {
      address: USDC[arbitrum.id],
      chainId: arbitrum.id,
    },
    simulation: { simulate: true },
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
