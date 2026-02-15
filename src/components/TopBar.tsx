"use client";

import { ArrowLeftRight, Check, Copy, History, LayoutDashboard, LogOut, Wallet } from "lucide-react";
import { shortAddr } from "../utils";

export type AppTab = "overview" | "manage" | "history";

interface TopBarProps {
  authenticated: boolean;
  addressActivated: boolean;
  walletAddress?: string;
  copied: boolean;
  onCopy: () => void;
  onLogout: () => void;
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

export function TopBar({
  authenticated,
  addressActivated,
  walletAddress,
  copied,
  onCopy,
  onLogout,
  activeTab,
  onTabChange,
}: TopBarProps) {
  return (
    <nav className="topbar">
      <div className="topbar-brand">
        <span className="brand-icon">
          <ArrowLeftRight size={16} />
        </span>
        <span className="brand-name">Nexus Bridge</span>
      </div>

      {authenticated && (
        <div className="topbar-nav">
          <button
            className={`topbar-tab${activeTab === "overview" ? " topbar-tab--active" : ""}`}
            onClick={() => onTabChange("overview")}
          >
            <LayoutDashboard size={13} />
            Overview
          </button>
          {addressActivated && (
            <>
              <button
                className={`topbar-tab${activeTab === "manage" ? " topbar-tab--active" : ""}`}
                onClick={() => onTabChange("manage")}
              >
                <Wallet size={13} />
                Manage Funds
              </button>
              <button
                className={`topbar-tab${activeTab === "history" ? " topbar-tab--active" : ""}`}
                onClick={() => onTabChange("history")}
              >
                <History size={13} />
                History
              </button>
            </>
          )}
        </div>
      )}

      {authenticated && walletAddress ? (
        <div className="topbar-actions">
          {addressActivated && (
            <button
              className={`chip-addr${copied ? " chip-addr--copied" : ""}`}
              onClick={onCopy}
            >
              <span className="chip-dot" />
              {copied ? "Copied" : shortAddr(walletAddress)}
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          )}
          <button className="btn-ghost" onClick={onLogout}>
            <LogOut size={13} />
            Disconnect
          </button>
        </div>
      ) : null}
    </nav>
  );
}
