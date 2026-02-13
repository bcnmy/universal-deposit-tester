import {
  encodeFunctionData,
  erc20Abi,
  zeroAddress,
  type Address,
  type Hash,
} from "viem";
import { ACROSS_SPOKEPOOL, SUPPORTED_TOKENS, DEPOSIT_V3_ABI } from "../config";
import { ScheduledExecutionBounds } from "./getScheduledExecutionBounds";
import type { SessionDetails } from "./types";
import { c, boxLine } from "../lib/log";

export type ExecuteDepositV3Params = {
  /** The session MEE client (with meeSessionActions extended) */
  sessionMeeClient: any;
  /** Session details returned from grantPermissionTypedDataSign */
  sessionDetails: SessionDetails;
  /** The depositor EOA address */
  walletAddress: Address;
  /** The recipient address on the destination chain (defaults to walletAddress) */
  recipient?: Address;
  /** Source chain ID (where tokens leave from) */
  sourceChainId: number;
  /** Destination chain ID (where tokens arrive) */
  destinationChainId: number;
  /** Amount to bridge (in token's native decimals) */
  amount: bigint;
  /** Token symbol (e.g. "USDC") — reserved for multi-token support */
  tokenSymbol?: string;
};

export async function executeDepositV3(
  params: ExecuteDepositV3Params
): Promise<{ hash: Hash }> {
  const {
    sessionMeeClient,
    sessionDetails,
    walletAddress,
    recipient = walletAddress,
    sourceChainId,
    destinationChainId,
    amount,
    tokenSymbol = "USDC",
  } = params;

  // Resolve the correct token addresses based on the symbol being bridged
  const token = SUPPORTED_TOKENS[tokenSymbol];
  if (!token) throw new Error(`Unsupported token: ${tokenSymbol}`);

  const inputTokenAddress = token.addresses[sourceChainId];
  const outputTokenAddress = token.addresses[destinationChainId];
  if (!inputTokenAddress)
    throw new Error(`${tokenSymbol} not available on chain ${sourceChainId}`);
  if (!outputTokenAddress)
    throw new Error(`${tokenSymbol} not available on chain ${destinationChainId}`);

  const now = Math.floor(Date.now() / 1000);

  // Approve the SpokePool to spend the token
  const approveCalldata = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [ACROSS_SPOKEPOOL[sourceChainId], amount],
  });

  // Build the depositV3 call
  const depositCalldata = encodeFunctionData({
    abi: DEPOSIT_V3_ABI,
    functionName: "depositV3",
    args: [
      walletAddress,                   // depositor
      recipient,                       // recipient
      inputTokenAddress,               // inputToken  (token on source)
      outputTokenAddress,              // outputToken (token on destination)
      amount,                          // inputAmount
      amount - (amount / 200n),        // outputAmount (0.5% slippage buffer)
      BigInt(destinationChainId),      // destinationChainId
      zeroAddress,                     // exclusiveRelayer (none)
      now,                             // quoteTimestamp
      now + 7200,                      // fillDeadline (2 hours)
      0,                               // exclusivityDeadline (none)
      "0x",                            // message (empty)
    ],
  });

  // Check if the session permission is already enabled on the source chain.
  // If so, use "USE" mode to skip the on-chain enable step (cheaper & faster).
  const enabledMap: Record<string, Record<number, boolean>> =
    await sessionMeeClient.checkEnabledPermissions(sessionDetails);

  const alreadyEnabled = Object.values(enabledMap).some(
    (chainMap) => chainMap[sourceChainId] === true,
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

  const result = await sessionMeeClient.usePermission({
    sessionDetails,
    mode,
    instructions: [
      {
        calls: [
          {
            to: inputTokenAddress,
            data: approveCalldata,
          },
          {
            to: ACROSS_SPOKEPOOL[sourceChainId],
            data: depositCalldata,
            value: 0n,
          },
        ],
        chainId: sourceChainId,
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

