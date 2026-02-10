import {
  Radio,
  Loader2,
  CircleCheck,
  ExternalLink,
  ArrowRight,
  CircleAlert,
  Settings2,
} from "lucide-react";
import type { PipelineState, TransferRecord } from "../hooks/usePipeline";
import { balanceKey } from "../hooks/useBalanceWatcher";
import { CHAIN_META, MEESCAN_URL } from "../constants";
import { SUPPORTED_TOKENS } from "../config";
import { shortAddr, formatTokenBySymbol } from "../utils";

interface Props {
  pipeline: PipelineState;
}

export function ListeningDashboard({ pipeline: p }: Props) {
  const destMeta = CHAIN_META[p.destChainId];

  return (
    <section className="listening-section">
      <div className="listening-container">
        {/* ── Status Header ───────────────────────────────────── */}
        <div className="listening-card listening-card--main">
          <div className="listening-header">
            <span className="listening-pulse-wrap">
              <span className="listening-pulse" />
              <Radio size={18} />
            </span>
            <div>
              <h2 className="listening-title">Listening for Deposits</h2>
              <p className="listening-sub">
                Send USDC, USDT or WETH to your address on any monitored chain.
                <br />
                It will be automatically bridged to{" "}
                <strong>{destMeta.name}</strong> via Across.
              </p>
            </div>
          </div>

          {/* ── Watched Chain Balances (all tokens) ───────────── */}
          <div className="listening-chains">
            {p.watchedChainIds.map((chainId) => {
              const meta = CHAIN_META[chainId];
              const isBridging = p.bridgingChainId === chainId;

              return (
                <div
                  key={chainId}
                  className={`listening-chain-card${
                    isBridging ? " listening-chain-card--bridging" : ""
                  }`}
                >
                  <div className="listening-chain-top">
                    <span
                      className="listening-chain-dot"
                      style={{ background: meta.color }}
                    />
                    <span className="listening-chain-name">{meta.name}</span>
                  </div>

                  <div className="listening-chain-balance">
                    {isBridging ? (
                      <span className="listening-bridging">
                        <Loader2 size={13} className="icon-spin" />
                        Bridging…
                      </span>
                    ) : (
                      <div className="listening-chain-tokens">
                        {Object.values(SUPPORTED_TOKENS).map((token) => {
                          if (!token.addresses[chainId]) return null;
                          const bal =
                            p.balances[balanceKey(token.symbol, chainId)] ?? 0n;
                          return (
                            <span
                              key={token.symbol}
                              className={`listening-token-bal${bal > 0n ? " listening-token-bal--positive" : ""}`}
                            >
                              {formatTokenBySymbol(bal, token.symbol)}{" "}
                              {token.symbol}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Destination + Session Info ─────────────────────── */}
          <div className="listening-meta">
            <div className="listening-meta-row">
              <span className="listening-meta-label">Destination</span>
              <span className="listening-meta-value">
                <span
                  className="listening-chain-dot"
                  style={{ background: destMeta.color }}
                />
                {destMeta.name}
              </span>
            </div>
            <div className="listening-meta-row">
              <span className="listening-meta-label">Recipient</span>
              <span className="listening-meta-value listening-meta-value--mono">
                {p.recipientIsSelf
                  ? `Self (${shortAddr(p.embeddedWallet?.address || "")})`
                  : shortAddr(p.recipientAddr)}
              </span>
            </div>
            <div className="listening-meta-row">
              <span className="listening-meta-label">Tokens</span>
              <span className="listening-meta-value">
                USDC · USDT · WETH
              </span>
            </div>
            <div className="listening-meta-row">
              <span className="listening-meta-label">Session</span>
              <span className="listening-meta-value listening-meta-value--mono">
                {p.sessionSignerAddress
                  ? shortAddr(p.sessionSignerAddress)
                  : "—"}
              </span>
            </div>
          </div>

          {/* ── Reconfigure ───────────────────────────────────── */}
          <button
            className="listening-reconfigure-btn"
            onClick={p.handleReconfigure}
            disabled={p.bridgeStatus === "loading"}
          >
            <Settings2 size={14} />
            Reconfigure
          </button>

          {/* ── Polling Status ─────────────────────────────────── */}
          <div className="listening-poll-status">
            <Loader2 size={12} className="icon-spin" />
            <span>
              Polling every 10s
              {p.lastChecked && (
                <> · Last checked {formatTimeDiff(p.lastChecked)}</>
              )}
            </span>
          </div>
        </div>

        {/* ── Bridge Status Banner (when active) ──────────────── */}
        {p.bridgeStatus === "loading" && (
          <div className="listening-card listening-banner listening-banner--loading">
            <Loader2 size={16} className="icon-spin" />
            <span>
              Bridging from{" "}
              <strong>
                {p.bridgingChainId
                  ? CHAIN_META[p.bridgingChainId]?.name
                  : "…"}
              </strong>{" "}
              to <strong>{destMeta.name}</strong>…
            </span>
          </div>
        )}

        {p.bridgeStatus === "success" && p.transfers.length > 0 && (
          <div className="listening-card listening-banner listening-banner--success">
            <CircleCheck size={16} />
            <span>
              Bridged{" "}
              {formatTokenBySymbol(
                p.transfers[0].amount,
                p.transfers[0].tokenSymbol,
              )}{" "}
              {p.transfers[0].tokenSymbol} from{" "}
              <strong>
                {CHAIN_META[p.transfers[0].sourceChainId]?.name}
              </strong>{" "}
              to <strong>{destMeta.name}</strong>
            </span>
          </div>
        )}

        {p.bridgeStatus === "error" && (
          <div className="listening-card listening-banner listening-banner--error">
            <CircleAlert size={16} />
            <span>Bridge failed — will retry on next poll</span>
          </div>
        )}

        {/* ── Transfer Log ────────────────────────────────────── */}
        <div className="listening-card">
          <h3 className="listening-log-title">Transfer Log</h3>

          {p.transfers.length === 0 ? (
            <p className="listening-log-empty">
              No transfers yet. Send tokens to your address to get started.
            </p>
          ) : (
            <div className="listening-log">
              {p.transfers.map((tx, i) => (
                <TransferRow key={`${tx.txHash}-${i}`} tx={tx} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ── Transfer Row ─────────────────────────────────────────────────── */

function TransferRow({ tx }: { tx: TransferRecord }) {
  const srcMeta = CHAIN_META[tx.sourceChainId];
  const dstMeta = CHAIN_META[tx.destinationChainId];

  return (
    <div className="listening-log-row">
      <CircleCheck size={14} className="listening-log-icon" />

      <span className="listening-log-amount">
        {formatTokenBySymbol(tx.amount, tx.tokenSymbol)} {tx.tokenSymbol}
      </span>

      <span className="listening-log-route">
        <span
          className="listening-chain-dot"
          style={{ background: srcMeta?.color }}
        />
        {srcMeta?.name}
        <ArrowRight size={12} />
        <span
          className="listening-chain-dot"
          style={{ background: dstMeta?.color }}
        />
        {dstMeta?.name}
      </span>

      <a
        href={`${MEESCAN_URL}/${tx.txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="listening-log-hash"
      >
        {shortAddr(tx.txHash)}
        <ExternalLink size={11} />
      </a>

      <span className="listening-log-time">
        {formatTimeDiff(tx.timestamp)}
      </span>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function formatTimeDiff(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

