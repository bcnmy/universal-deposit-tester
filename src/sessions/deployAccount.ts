import type { Address } from "viem";
import type { SignAuthorizationReturnType } from "viem/accounts";
import { SUPPORTED_CHAINS } from "../config";

/**
 * Deploys (activates) the EIP-7702 delegation on all supported chains
 * by sending an empty instruction (0 ETH) on each chain together with
 * the authorization. This makes the Nexus smart account logic live
 * across every chain in a single supertransaction.
 */
export async function deployAccount(params: {
  meeClient: any;
  walletAddress: Address;
  authorization: SignAuthorizationReturnType;
}) {
  const { meeClient, walletAddress, authorization } = params;

  const instructions = SUPPORTED_CHAINS.map((chain) => ({
    calls: [{ to: walletAddress, value: 0n }],
    chainId: chain.id,
  }));

  const { hash } = await meeClient.execute({
    instructions,
    sponsorship: true,
    delegate: true,
    authorizations: [authorization],
    multichain7702Auth: true,
  });

  const receipt = await meeClient.waitForSupertransactionReceipt({ hash });
  return receipt;
}

