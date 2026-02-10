import { ArrowLeftRight, Check, Copy, LogOut } from "lucide-react";
import { shortAddr } from "../utils";

export type AppTab = "overview" | "manage";

interface TopBarProps {
  authenticated: boolean;
  walletAddress?: string;
  copied: boolean;
  onCopy: () => void;
  onLogout: () => void;
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

export function TopBar({
  authenticated,
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
            Overview
          </button>
          <button
            className={`topbar-tab${activeTab === "manage" ? " topbar-tab--active" : ""}`}
            onClick={() => onTabChange("manage")}
          >
            Manage Funds
          </button>
        </div>
      )}

      {authenticated && walletAddress ? (
        <div className="topbar-actions">
          <button
            className={`chip-addr${copied ? " chip-addr--copied" : ""}`}
            onClick={onCopy}
          >
            <span className="chip-dot" />
            {copied ? "Copied" : shortAddr(walletAddress)}
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          <button className="btn-ghost" onClick={onLogout}>
            <LogOut size={13} />
            Disconnect
          </button>
        </div>
      ) : null}
    </nav>
  );
}
