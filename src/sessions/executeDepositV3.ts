import { encodeFunctionData, zeroAddress, type Address, type Hash } from "viem";
import { ACROSS_SPOKEPOOL, USDC, DEPOSIT_V3_ABI } from "../config";
import type { SessionDetails } from "./types";

export type ExecuteDepositV3Params = {
  /** The session MEE client (with meeSessionActions extended) */
  sessionMeeClient: any;
  /** Session details returned from grantPermissionTypedDataSign */
  sessionDetails: SessionDetails;
  /** The depositor / recipient EOA address */
  walletAddress: Address;
  /** Source chain ID (where USDC leaves from) */
  sourceChainId: number;
  /** Destination chain ID (where USDC arrives) */
  destinationChainId: number;
  /** Amount of USDC to bridge (6 decimals) */
  amount: bigint;
};

export async function executeDepositV3(
  params: ExecuteDepositV3Params
): Promise<{ hash: Hash }> {
  const {
    sessionMeeClient,
    sessionDetails,
    walletAddress,
    sourceChainId,
    destinationChainId,
    amount,
  } = params;

  const now = Math.floor(Date.now() / 1000);

  const calldata = encodeFunctionData({
    abi: DEPOSIT_V3_ABI,
    functionName: "depositV3",
    args: [
      walletAddress,                   // depositor
      walletAddress,                   // recipient
      USDC[sourceChainId],             // inputToken  (USDC on source)
      USDC[destinationChainId],        // outputToken (USDC on destination)
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
    mode: "ENABLE_AND_USE",
    instructions: [
      {
        calls: [
          {
            to: ACROSS_SPOKEPOOL[sourceChainId],
            data: calldata,
            value: 0n,
          },
        ],
        chainId: sourceChainId,
      },
    ],
    sessionDetails,
    sponsorship: true,
    simulation: {
      simulate: true,
    },
  });

  return result;
}

