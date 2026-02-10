import type { ElementType } from "react";
import { optimism, base, polygon, arbitrum } from "viem/chains";
import {
  Wallet,
  Globe,
  PenLine,
  Layers,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { SUPPORTED_CHAINS } from "./config";

/** Brand colors & labels for each chain */
export const CHAIN_META: Record<number, { name: string; color: string }> = {
  [optimism.id]: { name: "Optimism", color: "#FF0420" },
  [base.id]: { name: "Base", color: "#0052FF" },
  [polygon.id]: { name: "Polygon", color: "#8247E5" },
  [arbitrum.id]: { name: "Arbitrum", color: "#12AAFF" },
};

/** Destination chains */
export const DEST_CHAINS = [...SUPPORTED_CHAINS];

/** Icon theme for each pipeline step (6 setup steps) */
export const STEP_THEMES: { bg: string; fg: string; icon: ElementType }[] = [
  { bg: "#EFF6FF", fg: "#3B82F6", icon: Wallet },
  { bg: "#F0FDFA", fg: "#14B8A6", icon: Globe },
  { bg: "#F5F3FF", fg: "#8B5CF6", icon: PenLine },
  { bg: "#ECFEFF", fg: "#06B6D4", icon: Layers },
  { bg: "#FFF7ED", fg: "#F97316", icon: Rocket },
  { bg: "#ECFDF5", fg: "#10B981", icon: ShieldCheck },
];

/** MeeScan base URL */
export const MEESCAN_URL = "https://meescan.biconomy.io/details";

