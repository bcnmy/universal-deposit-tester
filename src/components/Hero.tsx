import { Check, Copy } from "lucide-react";
import { CHAIN_META } from "../constants";
import { SUPPORTED_CHAINS } from "../config";

interface HeroProps {
  authenticated: boolean;
  walletAddress?: string;
  copied: boolean;
  onCopy: () => void;
}

export function Hero({ authenticated, walletAddress, copied, onCopy }: HeroProps) {
  return (
    <header className="hero">
      {authenticated && walletAddress ? (
        <>
          <span className="hero-label">Universal Deposit Address</span>
          <div className="hero-address-row">
            <h1 className="hero-address">{walletAddress}</h1>
            <button
              className={`hero-copy-btn${copied ? " hero-copy-btn--copied" : ""}`}
              onClick={onCopy}
              aria-label="Copy address"
            >
              {copied ? (
                <>
                  <Check size={13} strokeWidth={2.5} />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy size={13} />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <div className="hero-divider" />
          <div className="hero-chains">
            {SUPPORTED_CHAINS.map((chain) => (
              <span key={chain.id} className="hero-chain-tag">
                <span
                  className="hero-chain-dot"
                  style={{ background: CHAIN_META[chain.id].color }}
                />
                {CHAIN_META[chain.id].name}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="hero-empty">
          <span className="hero-label">Universal Deposit Address</span>
          <p className="hero-empty-sub">Connect your wallet to get started</p>
        </div>
      )}
    </header>
  );
}

