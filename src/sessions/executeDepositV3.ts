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

export type ExecuteDepositV3Params = {
  /** The session MEE client (with meeSessionActions extended) */
  sessionMeeClient: any;
  /** Session details returned from grantPermissionTypedDataSign */
  sessionDetails: SessionDetails;
  /** The depositor EOA address */
  walletAddress: Address;
  /** The recipient address on the destination chain (defaults to walletAddress) */
  recipient?: Address;
  /** Source chain ID (where the token leaves from) */
  sourceChainId: number;
  /** Destination chain ID (where the token arrives) */
  destinationChainId: number;
  /** Amount to bridge (in token's native decimals) */
  amount: bigint;
  /** Token symbol (e.g. "USDC", "USDT", "WETH") — defaults to "USDC" */
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

  const token = SUPPORTED_TOKENS[tokenSymbol];
  if (!token) throw new Error(`Unsupported token: ${tokenSymbol}`);

  const inputToken = token.addresses[sourceChainId];
  const outputToken = token.addresses[destinationChainId];
  if (!inputToken) throw new Error(`${tokenSymbol} not available on source chain ${sourceChainId}`);
  if (!outputToken) throw new Error(`${tokenSymbol} not available on destination chain ${destinationChainId}`);

  // Query on-chain state to decide if the session permission has already
  // been enabled on the source chain.  `checkEnabledPermissions` returns a
  // mapping of  permissionId → chainId → isEnabled.
  const enabledMap: Record<string, Record<number, boolean>> =
    await sessionMeeClient.checkEnabledPermissions(sessionDetails);

  const alreadyEnabled = Object.values(enabledMap).some(
    (chainMap) => chainMap[sourceChainId] === true,
  );
  const mode = alreadyEnabled ? "USE" : "ENABLE_AND_USE";

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
      inputToken,                      // inputToken  (on source chain)
      outputToken,                     // outputToken (on destination chain)
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

  const result = await sessionMeeClient.usePermission({
    sessionDetails,
    mode,
    instructions: [
      {
        calls: [
          {
            to: inputToken,
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

