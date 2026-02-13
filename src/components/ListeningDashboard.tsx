"use client";

import {
  Radio,
  Settings2,
  Server,
  ShieldCheck,
  Trash2,
  Loader2,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import type { PipelineState } from "../hooks/usePipeline";
import { CHAIN_META } from "../constants";
import { shortAddr } from "../utils";

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
              <span
                className="listening-pulse"
                style={{
                  background: p.serverRegistered ? undefined : "#EF4444",
                }}
              />
              {p.serverRegistered ? (
                <Radio size={18} />
              ) : (
                <Server size={18} />
              )}
            </span>
            <div>
              <h2 className="listening-title">
                {p.serverRegistered
                  ? "Server Monitoring Active"
                  : "Waiting for Server Registration"}
              </h2>
              <p className="listening-sub">
                {p.serverRegistered ? (
                  <>
                    The server is polling your address for USDC, USDT &amp;
                    WETH deposits on all monitored chains.
                    <br />
                    {p.recipientIsSelf ? (
                      <>
                        Funds will be automatically bridged to{" "}
                        <strong>{destMeta.name}</strong> via Across.
                      </>
                    ) : (
                      <>
                        Funds will be bridged to{" "}
                        <strong>{destMeta.name}</strong> via Across and
                        forwarded to your recipient.
                      </>
                    )}
                    <br />
                    <em>You can safely close this tab.</em>
                  </>
                ) : (
                  <>
                    Session setup is complete. Registering with the server…
                  </>
                )}
              </p>
            </div>
          </div>

          {/* ── Server-side monitoring indicator ──────────────── */}
          <div className="listening-server-status">
            <span
              className="listening-server-dot"
              style={{
                background: p.serverRegistered ? "#10B981" : "#EF4444",
              }}
            />
            <span>
              {p.serverRegistered ? (
                <>
                  <ShieldCheck size={14} style={{ verticalAlign: "text-bottom", marginRight: 4 }} />
                  Server-side monitoring active — bridges even when tab is closed
                </>
              ) : (
                "Server not registered — waiting for confirmation"
              )}
            </span>
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
              <span className="listening-meta-label">Session Signer</span>
              <span className="listening-meta-value listening-meta-value--mono">
                {p.sessionSignerAddress
                  ? shortAddr(p.sessionSignerAddress)
                  : "—"}
              </span>
            </div>
          </div>

          {/* ── Reconfigure & Delete ──────────────────────────── */}
          <div className="listening-actions">
            <button
              className="listening-reconfigure-btn"
              onClick={p.handleReconfigure}
            >
              <Settings2 size={14} />
              Reconfigure
            </button>

            <button
              className="listening-reset-btn"
              onClick={p.handleFullReset}
              disabled={p.resetStatus === "loading"}
            >
              {p.resetStatus === "loading" ? (
                <Loader2 size={14} className="icon-spin" />
              ) : p.resetStatus === "done" ? (
                <CheckCircle2 size={14} />
              ) : (
                <RotateCcw size={14} />
              )}
              {p.resetStatus === "loading"
                ? "Resetting…"
                : p.resetStatus === "done"
                  ? "Re-setup started"
                  : "Full Reset & Re-setup"}
            </button>

            <button
              className="listening-delete-btn"
              onClick={p.handleDeleteSession}
              disabled={p.deleteStatus === "loading"}
            >
              {p.deleteStatus === "loading" ? (
                <Loader2 size={14} className="icon-spin" />
              ) : p.deleteStatus === "done" ? (
                <CheckCircle2 size={14} />
              ) : (
                <Trash2 size={14} />
              )}
              {p.deleteStatus === "loading"
                ? "Deleting…"
                : p.deleteStatus === "done"
                  ? "Deleted"
                  : "Delete Session Data"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
