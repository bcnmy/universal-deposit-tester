"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallets } from "@privy-io/react-auth";
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  RefreshCw,
  Loader2,
  ArrowRight,
  History,
  ArrowLeftRight,
  Send,
  Wallet,
} from "lucide-react";
import { CHAIN_META, MEESCAN_URL } from "../constants";
import { shortAddr } from "../utils";
import { SUPPORTED_TOKENS } from "../config";
import { formatUnits } from "viem";

// ── Types ────────────────────────────────────────────────────────────

type HistoryEntry = {
  timestamp: string;
  type: "bridge" | "forward" | "sweep";
  status: "success" | "error";
  hash?: string;
  error?: string;
  tokenSymbol: string;
  amount: string;
  sourceChainId: number;
  destChainId: number;
  recipient: string;
};

type FetchState = "idle" | "loading" | "success" | "error";

// ── Component ────────────────────────────────────────────────────────

export function BridgeHistory() {
  const { wallets } = useWallets();
  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
  const address = embeddedWallet?.address;

  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const fetchHistory = useCallback(async () => {
    if (!address) return;
    setFetchState("loading");
    setErrorMsg("");

    try {
      const res = await fetch(`/api/history/${address}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEntries(data.entries ?? []);
      setTotal(data.total ?? 0);
      setFetchState("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to fetch");
      setFetchState("error");
    }
  }, [address]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ── Helpers ──────────────────────────────────────────────────────────

  function formatAmount(amount: string, symbol: string): string {
    const token = SUPPORTED_TOKENS[symbol];
    if (!token) return `${amount} ${symbol}`;
    try {
      return `${formatUnits(BigInt(amount), token.decimals)} ${symbol}`;
    } catch {
      return `${amount} ${symbol}`;
    }
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function chainLabel(id: number): string {
    return CHAIN_META[id]?.name ?? `Chain ${id}`;
  }

  function chainColor(id: number): string {
    return CHAIN_META[id]?.color ?? "#6B7280";
  }

  // ── Render ──────────────────────────────────────────────────────────

  if (!address) {
    return (
      <section className="history-section">
        <div className="history-container">
          <div className="history-empty">
            <History size={32} />
            <p>Connect your wallet to view bridge history.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="history-section">
      <div className="history-container">
        {/* ── Header ──────────────────────────────────── */}
        <div className="history-header">
          <div>
            <h2 className="history-title">Bridge History</h2>
            <p className="history-sub">
              {total > 0
                ? `${total} operation${total !== 1 ? "s" : ""} recorded`
                : "No operations recorded yet"}
            </p>
          </div>
          <button
            className="history-refresh-btn"
            onClick={fetchHistory}
            disabled={fetchState === "loading"}
          >
            {fetchState === "loading" ? (
              <Loader2 size={14} className="icon-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            Refresh
          </button>
        </div>

        {/* ── Loading / Error / Empty ─────────────────── */}
        {fetchState === "loading" && entries.length === 0 && (
          <div className="history-empty">
            <Loader2 size={24} className="icon-spin" />
            <p>Loading history…</p>
          </div>
        )}

        {fetchState === "error" && (
          <div className="history-error-banner">
            <XCircle size={14} />
            <span>Failed to load history: {errorMsg}</span>
          </div>
        )}

        {fetchState === "success" && entries.length === 0 && (
          <div className="history-empty">
            <History size={32} />
            <p>No bridge operations recorded yet.</p>
            <p className="history-empty-hint">
              Operations will appear here once the server detects and bridges deposits.
            </p>
          </div>
        )}

        {/* ── Entries list ────────────────────────────── */}
        {entries.length > 0 && (
          <div className="history-list">
            {entries.map((entry, i) => (
              <div
                key={`${entry.timestamp}-${i}`}
                className={`history-entry ${entry.status === "success" ? "history-entry--success" : "history-entry--error"}`}
              >
                {/* Status icon + type */}
                <div className="history-entry-icon">
                  {entry.status === "success" ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <XCircle size={18} />
                  )}
                </div>

                {/* Main content */}
                <div className="history-entry-body">
                  <div className="history-entry-top">
                    {/* Type + route */}
                    <div className="history-entry-route">
                      {entry.type === "bridge" ? (
                        <ArrowLeftRight size={13} className="history-type-icon" />
                      ) : entry.type === "sweep" ? (
                        <Wallet size={13} className="history-type-icon" />
                      ) : (
                        <Send size={13} className="history-type-icon" />
                      )}
                      {entry.type === "sweep" ? (
                        <>
                          <span className="history-chain-tag" style={{ borderColor: chainColor(entry.sourceChainId) }}>
                            <span className="history-chain-dot" style={{ background: chainColor(entry.sourceChainId) }} />
                            {chainLabel(entry.sourceChainId)}
                          </span>
                          <ArrowRight size={12} className="history-arrow" />
                          <span className="history-detail-value history-detail-value--mono">
                            {shortAddr(entry.recipient)}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="history-chain-tag" style={{ borderColor: chainColor(entry.sourceChainId) }}>
                            <span className="history-chain-dot" style={{ background: chainColor(entry.sourceChainId) }} />
                            {chainLabel(entry.sourceChainId)}
                          </span>
                          <ArrowRight size={12} className="history-arrow" />
                          <span className="history-chain-tag" style={{ borderColor: chainColor(entry.destChainId) }}>
                            <span className="history-chain-dot" style={{ background: chainColor(entry.destChainId) }} />
                            {chainLabel(entry.destChainId)}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Timestamp */}
                    <span className="history-entry-time">
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>

                  {/* Amount + token */}
                  <div className="history-entry-amount">
                    {formatAmount(entry.amount, entry.tokenSymbol)}
                  </div>

                  {/* Recipient */}
                  <div className="history-entry-detail">
                    <span className="history-detail-label">To:</span>
                    <span className="history-detail-value history-detail-value--mono">
                      {shortAddr(entry.recipient)}
                    </span>
                  </div>

                  {/* Success → hash + MeeScan link */}
                  {entry.status === "success" && entry.hash && (
                    <div className="history-entry-hash">
                      <span className="history-detail-label">Hash:</span>
                      <a
                        href={`${MEESCAN_URL}/${entry.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="history-hash-link"
                      >
                        {shortAddr(entry.hash)}
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  )}

                  {/* Error → error message */}
                  {entry.status === "error" && entry.error && (
                    <div className="history-entry-error">
                      <span className="history-error-text">
                        {entry.error}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
