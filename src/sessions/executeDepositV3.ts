import {
  type Address,
  type Hex,
  type Hash,
  encodeFunctionData,
  erc20Abi,
} from "viem";
import { SUPPORTED_TOKENS, FEE_BPS, MAX_FEE_AMOUNTS } from "../config";
import { ScheduledExecutionBounds } from "./getScheduledExecutionBounds";
import type { SessionDetails } from "./types";

// ── Across Swap API types ───────────────────────────────────────────

type SwapApprovalTxn = {
  chainId: number;
  to: Address;
  data: Hex;
};

type SwapApprovalResponse = {
  crossSwapType: string;
  approvalTxns?: SwapApprovalTxn[];
  swapTx: {
    ecosystem: string;
    simulationSuccess: boolean;
    chainId: number;
    to: Address;
    data: Hex;
    gas: string;
  };
  inputAmount: string;
  maxInputAmount: string;
  expectedOutputAmount: string;
  minOutputAmount: string;
  expectedFillTime: number;
  quoteExpiryTimestamp: number;
  id: string;
};

const ACROSS_API_BASE = "https://app.across.to/api";

async function fetchSwapApproval(params: {
  inputToken: Address;
  outputToken: Address;
  originChainId: number;
  destinationChainId: number;
  amount: bigint;
  depositor: Address;
  recipient?: Address;
}): Promise<SwapApprovalResponse> {
  const url = new URL(`${ACROSS_API_BASE}/swap/approval`);
  url.searchParams.set("tradeType", "exactInput");
  url.searchParams.set("amount", String(params.amount));
  url.searchParams.set("inputToken", params.inputToken);
  url.searchParams.set("outputToken", params.outputToken);
  url.searchParams.set("originChainId", String(params.originChainId));
  url.searchParams.set(
    "destinationChainId",
    String(params.destinationChainId),
  );
  url.searchParams.set("depositor", params.depositor);
  if (params.recipient) {
    url.searchParams.set("recipient", params.recipient);
  }
  url.searchParams.set("skipOriginTxEstimation", "true");

  const res = await fetch(url.toString());
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      `Swap API error (${res.status}): ${errData.message || res.statusText}`,
    );
  }
  return res.json();
}

// ── Types ────────────────────────────────────────────────────────────

export type ExecuteDepositV3Params = {
  /** The session MEE client (with meeSessionActions extended) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  /** Input token symbol (e.g. "USDC") — the token being deposited */
  tokenSymbol?: string;
  /** Output token symbol on the destination chain. Defaults to tokenSymbol (same-token bridge) */
  outputTokenSymbol?: string;
  /** Fee collector address. When set and bridge is cross-token, a 10 bps fee is transferred here. */
  feeCollectorAddress?: Address;
};

/**
 * Calculate the fee for a cross-token bridge.
 * Fee = min(amount * FEE_BPS / 10_000, MAX_FEE_AMOUNTS[tokenSymbol])
 * Returns 0n for same-token bridges.
 */
export function calculateBridgeFee(
  amount: bigint,
  tokenSymbol: string,
  isCrossToken: boolean,
): bigint {
  if (!isCrossToken) return 0n;
  const rawFee = (amount * FEE_BPS) / 10_000n;
  const maxFee = MAX_FEE_AMOUNTS[tokenSymbol];
  if (maxFee && rawFee > maxFee) return maxFee;
  return rawFee;
}

export async function executeDepositV3(
  params: ExecuteDepositV3Params,
): Promise<{ hash: Hash; feeAmount?: bigint }> {
  const {
    sessionMeeClient,
    sessionDetails,
    walletAddress,
    recipient = walletAddress,
    sourceChainId,
    destinationChainId,
    amount,
    tokenSymbol = "USDC",
    outputTokenSymbol,
    feeCollectorAddress,
  } = params;

  const effectiveOutputSymbol = outputTokenSymbol ?? tokenSymbol;
  const isCrossToken = effectiveOutputSymbol !== tokenSymbol;

  console.log(
    `[executeDepositV3] tokenSymbol=${tokenSymbol}, outputTokenSymbol=${outputTokenSymbol ?? "(undefined)"}, ` +
      `effectiveOutput=${effectiveOutputSymbol}, isCrossToken=${isCrossToken}`,
  );

  // Resolve input token address on the source chain
  const inputToken = SUPPORTED_TOKENS[tokenSymbol];
  if (!inputToken) throw new Error(`Unsupported input token: ${tokenSymbol}`);
  const inputTokenAddress = inputToken.addresses[sourceChainId];
  if (!inputTokenAddress)
    throw new Error(`${tokenSymbol} not available on chain ${sourceChainId}`);

  // Resolve output token address on the destination chain
  const outputToken = SUPPORTED_TOKENS[effectiveOutputSymbol];
  if (!outputToken)
    throw new Error(`Unsupported output token: ${effectiveOutputSymbol}`);
  const outputTokenAddress = outputToken.addresses[destinationChainId];
  if (!outputTokenAddress)
    throw new Error(
      `${effectiveOutputSymbol} not available on chain ${destinationChainId}`,
    );

  // ── Calculate fee for cross-token bridges ─────────────────────────
  const feeAmount = feeCollectorAddress
    ? calculateBridgeFee(amount, tokenSymbol, isCrossToken)
    : 0n;
  const bridgeAmount = amount - feeAmount;

  if (feeAmount > 0n) {
    console.log(
      `[executeDepositV3] Cross-token fee: ${feeAmount} ${tokenSymbol} ` +
        `(${Number(feeAmount * 10_000n / amount)} bps) → ${feeCollectorAddress}`,
    );
  }

  // ── Fetch swap approval from Across Swap API ──────────────────────
  const swap = await fetchSwapApproval({
    inputToken: inputTokenAddress,
    outputToken: outputTokenAddress,
    originChainId: sourceChainId,
    destinationChainId,
    amount: bridgeAmount,
    depositor: walletAddress,
    recipient,
  });

  console.log(
    `[executeDepositV3] Swap API: crossSwapType=${swap.crossSwapType}, ` +
      `expected output=${swap.expectedOutputAmount}, ` +
      `min output=${swap.minOutputAmount}, ` +
      `target=${swap.swapTx.to}, ` +
      `fill time=${swap.expectedFillTime}s`,
  );

  // ── Build calls array ─────────────────────────────────────────────
  // The Swap API provides:
  //   1. Optional approvalTxns (ERC-20 approve calls — spender may be
  //      SpokePool or SpokePoolPeriphery depending on the route)
  //   2. The main swapTx (targets SpokePool for same-token routes, or
  //      SpokePoolPeriphery for cross-token routes)
  //
  // When a cross-token fee applies, we prepend a transfer to the fee
  // collector before the approval + bridge calls.

  const calls: { to: Address; data: Hex; value: bigint }[] = [];

  // Prepend fee transfer for cross-token bridges
  if (feeAmount > 0n && feeCollectorAddress) {
    calls.push({
      to: inputTokenAddress,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [feeCollectorAddress, feeAmount],
      }),
      value: 0n,
    });
  }

  // Include approval txns from the Swap API
  if (swap.approvalTxns) {
    for (const approvalTx of swap.approvalTxns) {
      calls.push({
        to: approvalTx.to as Address,
        data: approvalTx.data as Hex,
        value: 0n,
      });
    }
  }

  // The main swap/bridge transaction
  calls.push({
    to: swap.swapTx.to as Address,
    data: swap.swapTx.data as Hex,
    value: 0n,
  });

  // ── Execute via Biconomy session ──────────────────────────────────
  const enabledMap: Record<string, Record<number, boolean>> =
    await sessionMeeClient.checkEnabledPermissions(sessionDetails);

  const alreadyEnabled = Object.values(enabledMap).some(
    (chainMap) => chainMap[sourceChainId] === true,
  );
  const mode = alreadyEnabled ? "USE" : "ENABLE_AND_USE";

  const result = await sessionMeeClient.usePermission({
    sessionDetails,
    mode,
    instructions: [
      {
        calls,
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

  return { ...result, feeAmount };
}
