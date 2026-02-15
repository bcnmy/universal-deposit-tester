import { base, optimism, polygon, arbitrum, mainnet, bsc } from "viem/chains";
import { http, type Chain, type Transport } from "viem";
import type { Address } from "viem";
import { setGlobalConstants } from "@rhinestone/module-sdk";

// ─── Rhinestone Policy Override ──────────────────────────────────────
// The V1 Sudo Policy (0x0000000000FEEc8D74e3143fBaBbca515358d869) is
// NOT deployed on Polygon.  The Legacy Sudo Policy below IS deployed on
// ALL supported chains (Optimism, Base, Arbitrum, Polygon).  Override
// the global constant so every getSudoPolicy() call — including the
// SDK-internal ones in grantPermission's userOpPolicies — uses the
// universally-deployed address.
setGlobalConstants({
  SUDO_POLICY_ADDRESS: "0x0000003111cD8e92337C100F22B7A9dbf8DEE301",
});

/**
 * Map chain IDs → RPC URLs from env vars.
 * IMPORTANT: Next.js only inlines NEXT_PUBLIC_* env vars when referenced as
 * literal `process.env.NEXT_PUBLIC_X` expressions — dynamic bracket access
 * (e.g. `process.env[key]`) is NOT replaced at build time.  So we must
 * reference each variable explicitly here.
 */
const RPC_URLS: Record<number, string | undefined> = {
  [base.id]: process.env.NEXT_PUBLIC_RPC_BASE,
  [mainnet.id]: process.env.NEXT_PUBLIC_RPC_ETHEREUM,
  [arbitrum.id]: process.env.NEXT_PUBLIC_RPC_ARBITRUM,
  [optimism.id]: process.env.NEXT_PUBLIC_RPC_OPTIMISM,
  [bsc.id]: process.env.NEXT_PUBLIC_RPC_BNB,
  [polygon.id]: process.env.NEXT_PUBLIC_RPC_POLYGON,
};

/** Returns the appropriate transport for a chain, using env-var RPC URLs */
export function getTransport(chain: Chain): Transport {
  return http(RPC_URLS[chain.id]);
}

// ─── Biconomy ────────────────────────────────────────────────────────
export const NEXUS_SINGLETON =
  "0x00000000383e8cBe298514674Ea60Ee1d1de50ac" as const;

// ─── Across Protocol V3 SpokePool Addresses ─────────────────────────
export const ACROSS_SPOKEPOOL: Record<number, Address> = {
  [optimism.id]: "0x6f26Bf09B1C792e3228e5467807a900A503c0281",
  [base.id]: "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64",
  [polygon.id]: "0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096",
  [arbitrum.id]: "0xe35e9842fceaca96570b734083f4a58e8f7c5f2a",
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
// Bump this whenever the session permission scope changes (e.g. new tokens,
// policy address changes) so that existing stored sessions are invalidated
// and users must re-enable.
export const SESSION_VERSION = 4;

// ─── Biconomy API Key (for MEE service authentication) ──────────────
export const BICONOMY_API_KEY =
  // Client-side (NEXT_PUBLIC_ prefix) or server-side env var
  (typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BICONOMY_API_KEY
    : process.env.BICONOMY_API_KEY ?? process.env.NEXT_PUBLIC_BICONOMY_API_KEY
  ) as string;

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
