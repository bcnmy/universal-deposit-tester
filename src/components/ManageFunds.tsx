"use client";

import {
  RefreshCw,
  Check,
  Loader2,
  ExternalLink,
  CircleAlert,
  Zap,
  ArrowRight,
  Layers,
} from "lucide-react";
import { SUPPORTED_CHAINS, SUPPORTED_TOKENS } from "../config";
import { CHAIN_META, MEESCAN_URL } from "../constants";
import {
  useManageFunds,
  SWEEP_SYMBOLS,
  NATIVE_ETH_SYMBOL,
  type SweepRecord,
} from "../hooks/useManageFunds";
import { formatTokenBySymbol, shortAddr, isValidAddress } from "../utils";

export function ManageFunds() {
  const mf = useManageFunds();

  const isValidRecipient = isValidAddress(mf.recipient);
  const canSweep =
    isValidRecipient &&
    mf.sweepableTokens.length > 0 &&
    mf.sweepStatus !== "loading";

  return (
    <section className="manage-section">
      <div className="manage-container">
        {/* ── Header ─────────────────────────────────── */}
        <div className="manage-header">
          <h2 className="manage-title">Manage Funds</h2>
          <p className="manage-sub">
            View token balances per chain and sweep them all in one transaction.
          </p>
        </div>

        {/* ── Chain Selector ──────────────────────────── */}
        <div className="manage-card">
          <div className="manage-card-head">
            <h3 className="manage-card-title">Chain</h3>
            <button
              className="manage-refresh-btn"
              onClick={mf.refreshBalances}
              disabled={mf.isLoadingBalances}
              aria-label="Refresh balances"
            >
              <RefreshCw
                size={13}
                className={mf.isLoadingBalances ? "spin" : ""}
              />
              {mf.isLoadingBalances ? "Loading…" : "Refresh"}
            </button>
          </div>

          <div className="manage-chain-selector">
            {SUPPORTED_CHAINS.map((chain) => {
              const meta = CHAIN_META[chain.id];
              const isSelected = mf.selectedChainId === chain.id;
              return (
                <button
                  key={chain.id}
                  className={`manage-chain-btn${isSelected ? " manage-chain-btn--active" : ""}`}
                  onClick={() => mf.setSelectedChainId(chain.id)}
                >
                  <span
                    className="manage-chain-dot"
                    style={{ background: meta.color }}
                  />
                  {meta.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Token Balances ──────────────────────────── */}
        <div className="manage-card">
          <div className="manage-card-head">
            <h3 className="manage-card-title">
              Balances on {CHAIN_META[mf.selectedChainId].name}
            </h3>
          </div>

          <div className="manage-balance-list">
            {SWEEP_SYMBOLS.map((sym) => {
              const isNative = sym === NATIVE_ETH_SYMBOL;
              const config = isNative ? null : SUPPORTED_TOKENS[sym];
              const hasToken = isNative || !!config?.addresses[mf.selectedChainId];
              const bal = mf.chainBalances[sym] ?? 0n;
              const isSweepable = mf.sweepableTokens.includes(sym);

              return (
                <div
                  key={sym}
                  className={`manage-token-row${isSweepable ? " manage-token-row--sweepable" : ""}${!hasToken ? " manage-token-row--disabled" : ""}`}
                >
                  <span className="manage-token-symbol">{sym}</span>
                  <span className="manage-token-name">
                    {isNative ? "Native Ether" : config!.name}
                  </span>
                  <span className="manage-token-bal">
                    {hasToken ? formatTokenBySymbol(bal, sym) : "N/A"}
                  </span>
                  {isSweepable && (
                    <Check size={13} className="manage-token-check" />
                  )}
                </div>
              );
            })}
          </div>

          {mf.sweepableTokens.length > 0 && (
            <div className="manage-sweep-summary">
              <Layers size={13} />
              <span>
                {mf.sweepableTokens.length} token
                {mf.sweepableTokens.length > 1 ? "s" : ""} ready to sweep
              </span>
            </div>
          )}
        </div>

        {/* ── Sweep Form ──────────────────────────────── */}
        <div className="manage-card">
          <h3 className="manage-card-title">Sweep All Tokens</h3>

          {/* Recipient */}
          <label className="manage-label" htmlFor="manage-recipient">
            Recipient Address
          </label>
          <input
            id="manage-recipient"
            className={`manage-input${mf.recipient && !isValidRecipient ? " manage-input--error" : ""}`}
            type="text"
            placeholder="0x…"
            value={mf.recipient}
            onChange={(e) => {
              mf.setRecipient(e.target.value);
              if (mf.sweepStatus !== "idle") mf.resetSweep();
            }}
            spellCheck={false}
            autoComplete="off"
          />
          {mf.recipient && !isValidRecipient && (
            <span className="manage-field-error">Invalid address</span>
          )}

          {/* Gas note */}
          <div className="manage-gas-note">
            <Zap size={12} />
            <span>
              Gas paid with USDC · Transfer amounts resolved at execution time
              after gas is deducted
            </span>
          </div>

          {/* Sweep button */}
          <button
            className="manage-send-btn"
            disabled={!canSweep}
            onClick={mf.handleSweep}
          >
            {mf.sweepStatus === "loading" ? (
              <>
                <Loader2 size={15} className="spin" />
                Sweeping…
              </>
            ) : (
              <>
                <Layers size={15} />
                Sweep{" "}
                {mf.sweepableTokens.length > 0
                  ? `${mf.sweepableTokens.length} Token${mf.sweepableTokens.length > 1 ? "s" : ""}`
                  : "All"}
              </>
            )}
          </button>

          {/* Success message */}
          {mf.sweepStatus === "success" && mf.txHash && (
            <div className="manage-result manage-result--success">
              <Check size={14} strokeWidth={2.5} />
              <span>
                Swept successfully!{" "}
                <a
                  href={`${MEESCAN_URL}/${mf.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="manage-result-link"
                >
                  View on MeeScan <ExternalLink size={10} />
                </a>
              </span>
            </div>
          )}

          {/* Error message */}
          {mf.sweepStatus === "error" && mf.error && (
            <div className="manage-result manage-result--error">
              <CircleAlert size={14} />
              <span>{mf.error}</span>
            </div>
          )}
        </div>

        {/* ── Sweep History ───────────────────────────── */}
        {mf.sweeps.length > 0 && (
          <div className="manage-card">
            <h3 className="manage-card-title">Recent Sweeps</h3>
            <div className="manage-sends-list">
              {mf.sweeps.map((s, i) => (
                <SweepRow key={i} sweep={s} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function SweepRow({ sweep }: { sweep: SweepRecord }) {
  const meta = CHAIN_META[sweep.chainId];
  const time = new Date(sweep.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="manage-send-row">
      <span
        className="manage-chain-dot"
        style={{ background: meta.color }}
      />
      <span className="manage-send-amount">
        {sweep.tokens.map((t) => `${t.amount} ${t.symbol}`).join(", ")}
      </span>
      <ArrowRight size={12} className="manage-send-arrow" />
      <span className="manage-send-recipient">
        {shortAddr(sweep.recipient)}
      </span>
      <a
        href={`${MEESCAN_URL}/${sweep.txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="manage-send-link"
      >
        <ExternalLink size={11} />
      </a>
      <span className="manage-send-time">{time}</span>
    </div>
  );
}
