import type { Address, Hash } from "viem";
import type { SignAuthorizationReturnType } from "viem/accounts";
import { arbitrum } from "viem/chains";
import { SUPPORTED_CHAINS, USDC } from "../config";
import { ScheduledExecutionBounds } from "./getScheduledExecutionBounds";

/**
 * Deploys (activates) the EIP-7702 delegation on all supported chains
 * by sending an empty instruction (0 ETH) on each chain together with
 * the authorization. This makes the Nexus smart account logic live
 * across every chain in a single supertransaction.
 *
 * Uses the quote → sign → execute model with simulation enabled.
 */
export async function deployAccount(params: {
  meeClient: any;
  walletAddress: Address;
  authorization: SignAuthorizationReturnType;
}): Promise<{ hash: Hash }> {
  const { meeClient, walletAddress, authorization } = params;

  const instructions = SUPPORTED_CHAINS.map((chain) => ({
    calls: [{ to: walletAddress, value: 0n }],
    chainId: chain.id,
  }));

  // 1. Get quote with simulation
  const quote = await meeClient.getQuote({
    instructions,
    delegate: true,
    feeToken: {
      address: USDC[arbitrum.id],
      chainId: arbitrum.id,
    },
    authorizations: [authorization],
    multichain7702Auth: true,
    simulation: { simulate: true },
    ...ScheduledExecutionBounds,
  });

  // 2. Sign the quote
  const signedQuote = await meeClient.signQuote({ quote });

  // 3. Execute the signed quote
  const { hash } = await meeClient.executeSignedQuote({ signedQuote });

  // 4. Wait for receipt
  await meeClient.waitForSupertransactionReceipt({ hash });

  return { hash };
}

