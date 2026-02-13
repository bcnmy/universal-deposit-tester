import {
  encodeFunctionData,
  erc20Abi,
  type Address,
  type Hash,
} from "viem";
import { SUPPORTED_TOKENS } from "../config";
import { ScheduledExecutionBounds } from "./getScheduledExecutionBounds";
import type { SessionDetails } from "./types";
import { c, boxLine } from "../lib/log";

export type ExecuteForwardTransferParams = {
  /** The session MEE client (with meeSessionActions extended) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessionMeeClient: any;
  /** Session details returned from grantPermissionTypedDataSign */
  sessionDetails: SessionDetails;
  /** The wallet (smart account) address that currently holds the tokens */
  walletAddress: Address;
  /** The recipient address to forward the tokens to */
  recipient: Address;
  /** The chain ID where the tokens currently reside (and will be transferred on) */
  chainId: number;
  /** Amount to forward (in token's native decimals) */
  amount: bigint;
  /** Token symbol (e.g. "USDC", "USDT", "WETH") — defaults to "USDC" */
  tokenSymbol?: string;
};

/**
 * Forward tokens that already reside on the destination chain from the
 * wallet address to the configured recipient via a simple ERC20 `transfer`.
 *
 * This is used when funds land directly on the destination chain (e.g. someone
 * sends tokens to the deposit address on the destination chain) and the
 * recipient differs from the wallet address.
 */
export async function executeForwardTransfer(
  params: ExecuteForwardTransferParams,
): Promise<{ hash: Hash }> {
  const {
    sessionMeeClient,
    sessionDetails,
    walletAddress,
    recipient,
    chainId,
    amount,
    tokenSymbol = "USDC",
  } = params;

  if (recipient === walletAddress) {
    throw new Error("Recipient is the same as wallet address — nothing to forward");
  }

  const token = SUPPORTED_TOKENS[tokenSymbol];
  if (!token) throw new Error(`Unsupported token: ${tokenSymbol}`);

  const tokenAddress = token.addresses[chainId];
  if (!tokenAddress)
    throw new Error(`${tokenSymbol} not available on chain ${chainId}`);

  // Check if the session permission is already enabled on this chain.
  const enabledMap: Record<string, Record<number, boolean>> =
    await sessionMeeClient.checkEnabledPermissions(sessionDetails);

  const alreadyEnabled = Object.values(enabledMap).some(
    (chainMap) => chainMap[chainId] === true,
  );
  const mode = alreadyEnabled ? "USE" : "ENABLE_AND_USE";

  console.log(
    boxLine(
      c.dim(`   Session: ${mode}`) +
        (alreadyEnabled
          ? c.dim(" (permissions pre-enabled)")
          : c.dim(" (will enable + use)")),
    ),
  );

  // Build a simple ERC20 transfer call
  const transferCalldata = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [recipient, amount],
  });

  const result = await sessionMeeClient.usePermission({
    sessionDetails,
    mode,
    instructions: [
      {
        calls: [
          {
            to: tokenAddress,
            data: transferCalldata,
          },
        ],
        chainId,
        ...ScheduledExecutionBounds,
      },
    ],
    verificationGasLimit: 2_500_000n,
    sponsorship: true,
    simulation: {
      simulate: true,
    },
  });

  return result;
}

