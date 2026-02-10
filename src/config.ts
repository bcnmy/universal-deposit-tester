import { base, optimism, polygon, arbitrum } from "viem/chains";
import type { Address } from "viem";

// ─── Biconomy ────────────────────────────────────────────────────────
export const NEXUS_SINGLETON =
  "0x000000004F43C49e93C970E84001853a70923B03" as const;

// ─── Across Protocol V3 SpokePool Addresses ─────────────────────────
export const ACROSS_SPOKEPOOL: Record<number, Address> = {
  [optimism.id]: "0x6f26Bf09B1C792e3228e5467807a900A503c0281",
  [base.id]: "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64",
  [polygon.id]: "0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096",
  [arbitrum.id]: "0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A",
};

// ─── USDC Addresses ──────────────────────────────────────────────────
export const USDC: Record<number, Address> = {
  [optimism.id]: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  [base.id]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  [polygon.id]: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  [arbitrum.id]: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
};

// ─── Biconomy API Key (for MEE service authentication) ──────────────
export const BICONOMY_API_KEY = import.meta.env.VITE_BICONOMY_API_KEY as string;

// ─── Chains used in this app ─────────────────────────────────────────
export const SUPPORTED_CHAINS = [optimism, base, polygon, arbitrum] as const;

// ─── depositV3 ABI (Across SpokePool) ────────────────────────────────
export const DEPOSIT_V3_ABI = [
  {
    name: "depositV3",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "depositor", type: "address" },
      { name: "recipient", type: "address" },
      { name: "inputToken", type: "address" },
      { name: "outputToken", type: "address" },
      { name: "inputAmount", type: "uint256" },
      { name: "outputAmount", type: "uint256" },
      { name: "destinationChainId", type: "uint256" },
      { name: "exclusiveRelayer", type: "address" },
      { name: "quoteTimestamp", type: "uint32" },
      { name: "fillDeadline", type: "uint32" },
      { name: "exclusivityDeadline", type: "uint32" },
      { name: "message", type: "bytes" },
    ],
    outputs: [],
  },
] as const;
