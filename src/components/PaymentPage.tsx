import { useState } from "react";
import QRCode from "react-qr-code";
import { ArrowLeftRight, Copy, Check, ExternalLink } from "lucide-react";
import { CHAIN_META } from "../constants";
import { SUPPORTED_CHAINS, TOKEN_SYMBOLS } from "../config";


interface PaymentPageProps {
  address: string;
}

export function PaymentPage({ address }: PaymentPageProps) {
  const [copied, setCopied] = useState(false);

  const pageUrl = window.location.href;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = address;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="pay-page">
      <div className="pay-bg-glow" aria-hidden="true" />

      {/* Brand */}
      <div className="pay-brand">
        <span className="brand-icon">
          <ArrowLeftRight size={16} />
        </span>
        <span className="brand-name">Nexus Bridge</span>
      </div>

      {/* Card */}
      <div className="pay-card">
        {/* Left panel – QR Code + Address */}
        <div className="pay-card-left">
          <div className="pay-qr-wrap">
            <div className="pay-qr-inner">
              <QRCode
                value={pageUrl}
                size={200}
                bgColor="transparent"
                fgColor="#111827"
                level="M"
              />
            </div>
          </div>

          {/* Address */}
          <div className="pay-address-box">
            <span className="pay-address-full">{address}</span>
            <button
              className={`pay-copy-btn${copied ? " pay-copy-btn--copied" : ""}`}
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check size={14} strokeWidth={2.5} />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copy Address
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right panel – Content */}
        <div className="pay-card-right">
          {/* Heading */}
          <h1 className="pay-heading">Send Tokens</h1>
          <p className="pay-sub">
            Send {TOKEN_SYMBOLS.join(", ")} to the address below on any of the
            supported chains. It will be automatically forwarded to the
            recipient.
          </p>

          {/* Supported tokens */}
          <div className="pay-chains-section">
            <span className="pay-chains-label">Supported Tokens</span>
            <div className="pay-chains-grid">
              {TOKEN_SYMBOLS.map((symbol) => (
                <div key={symbol} className="pay-chain-pill">
                  <span>{symbol}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Supported chains */}
          <div className="pay-chains-section">
            <span className="pay-chains-label">Supported Chains</span>
            <div className="pay-chains-grid">
              {SUPPORTED_CHAINS.map((chain) => {
                const meta = CHAIN_META[chain.id];
                return (
                  <div key={chain.id} className="pay-chain-pill">
                    <span
                      className="pay-chain-dot"
                      style={{ background: meta.color }}
                    />
                    <span>{meta.name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Info note */}
          <div className="pay-note">
            Deposits on any supported chain are automatically bridged to the
            recipient's destination chain via{" "}
            <a
              href="https://across.to"
              target="_blank"
              rel="noopener noreferrer"
              className="pay-note-link"
            >
              Across Protocol <ExternalLink size={10} />
            </a>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="pay-footer">
        <span>Powered by</span>
        <a
          href="https://biconomy.io"
          target="_blank"
          rel="noopener noreferrer"
          className="pay-footer-link"
        >
          Biconomy
        </a>
        <span>×</span>
        <a
          href="https://across.to"
          target="_blank"
          rel="noopener noreferrer"
          className="pay-footer-link"
        >
          Across
        </a>
      </div>
    </div>
  );
}

