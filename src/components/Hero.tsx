import { useState, useCallback } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { CHAIN_META } from "../constants";
import { SUPPORTED_CHAINS } from "../config";

interface HeroProps {
  authenticated: boolean;
  walletAddress?: string;
  copied: boolean;
  onCopy: () => void;
}

export function Hero({ authenticated, walletAddress, copied, onCopy }: HeroProps) {
  const [shared, setShared] = useState(false);

  const handleShare = useCallback(async () => {
    if (!walletAddress) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?pay=${walletAddress}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  }, [walletAddress]);

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
                  <span>Copy Address</span>
                </>
              )}
            </button>
          </div>
          <div className="hero-divider" />
          <button
            className={`hero-share-btn${shared ? " hero-share-btn--shared" : ""}`}
            onClick={handleShare}
            aria-label="Share payment link"
          >
            {shared ? (
              <>
                <Check size={16} strokeWidth={2.5} />
                <span>Link Copied!</span>
              </>
            ) : (
              <>
                <Share2 size={16} />
                <span>Share Payment Link</span>
              </>
            )}
          </button>
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
          <h1 className="hero-headline">Universal Deposit Address</h1>
          <p className="hero-description">
            Receive funds on any chain and have them automatically transferred
            to another chain and another address.
          </p>
          <p className="hero-secured">
            Secured by <strong>Biconomy</strong>, <strong>Privy</strong> &amp; <strong>Across</strong>
          </p>
        </div>
      )}
    </header>
  );
}
