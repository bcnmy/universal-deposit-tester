import { base, optimism, polygon, arbitrum } from "viem/chains";
import type { Address } from "viem";

// ─── Biconomy ────────────────────────────────────────────────────────
export const NEXUS_SINGLETON =
  "0x00000000383e8cBe298514674Ea60Ee1d1de50ac" as const;

// ─── Across Protocol V3 SpokePool Addresses ─────────────────────────
export const ACROSS_SPOKEPOOL: Record<number, Address> = {
  [optimism.id]: "0x6f26Bf09B1C792e3228e5467807a900A503c0281",
  [base.id]: "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64",
  [polygon.id]: "0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096",
  [arbitrum.id]: "0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A",
};

// ─── Token Addresses ─────────────────────────────────────────────────
export const USDC: Record<number, Address> = {
  [optimism.id]: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  [base.id]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  [polygon.id]: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  [arbitrum.id]: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
};

export const USDT: Record<number, Address> = {
  [optimism.id]: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
  [base.id]: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  [polygon.id]: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  [arbitrum.id]: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
};

export const WETH: Record<number, Address> = {
  [optimism.id]: "0x4200000000000000000000000000000000000006",
  [base.id]: "0x4200000000000000000000000000000000000006",
  [polygon.id]: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
  [arbitrum.id]: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
};

// ─── Token Configuration ─────────────────────────────────────────────
export type TokenConfig = {
  symbol: string;
  name: string;
  decimals: number;
  addresses: Record<number, Address>;
};

export const SUPPORTED_TOKENS: Record<string, TokenConfig> = {
  USDC: { symbol: "USDC", name: "USD Coin", decimals: 6, addresses: USDC },
  USDT: { symbol: "USDT", name: "Tether USD", decimals: 6, addresses: USDT },
  WETH: { symbol: "WETH", name: "Wrapped Ether", decimals: 18, addresses: WETH },
};

export const TOKEN_SYMBOLS = Object.keys(SUPPORTED_TOKENS) as string[];

// ─── Session Version ─────────────────────────────────────────────────
// Bump this whenever the session permission scope changes (e.g. new tokens)
// so that existing stored sessions are invalidated and users must re-enable.
export const SESSION_VERSION = 2;

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
