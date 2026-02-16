"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Shield,
  Wallet,
  PenLine,
  RefreshCw,
  Trash2,
  CheckCircle,
  XCircle,
  Radio,
  LogOut,
  AlertTriangle,
  Bomb,
  Settings,
  Save,
} from "lucide-react";

// ── Hardcoded admin address ──────────────────────────────────────────
const ADMIN_ADDRESS = "0x6CC236D96C1f02916D469dba37c52550ba0821FF";

// ── Chain meta (inlined to keep the page self-contained) ─────────────
const CHAIN_META: Record<number, { name: string; color: string }> = {
  10: { name: "Optimism", color: "#FF0420" },
  8453: { name: "Base", color: "#0052FF" },
  137: { name: "Polygon", color: "#8247E5" },
  42161: { name: "Arbitrum", color: "#12AAFF" },
};

function chainLabel(id: number): string {
  return CHAIN_META[id]?.name ?? `Chain ${id}`;
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ── Types ────────────────────────────────────────────────────────────
type SessionInfo = {
  walletAddress: string;
  sessionSignerAddress: string;
  listeningConfig: {
    destChainId: number;
    recipientIsSelf: boolean;
    recipientAddr: string;
  };
  sessionVersion: number;
  registeredAt: string;
  lastPollAt: string | null;
  active: boolean;
};

type AuthState = {
  address: string;
  message: string;
  signature: string;
};

// ── Helpers to talk to window.ethereum ────────────────────────────────

async function connectWallet(): Promise<string> {
  const eth = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
  if (!eth) throw new Error("No wallet extension found. Install MetaMask or Rabby.");
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts.length) throw new Error("No accounts returned");
  return accounts[0];
}

async function signMessage(message: string, address: string): Promise<string> {
  const eth = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
  if (!eth) throw new Error("No wallet extension found");
  const sig = (await eth.request({
    method: "personal_sign",
    params: [message, address],
  })) as string;
  return sig;
}

// ═══════════════════════════════════════════════════════════════════════
//  Admin Page Component
// ═══════════════════════════════════════════════════════════════════════

export default function AdminPage() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [nuking, setNuking] = useState(false);
  const [nukeConfirm, setNukeConfirm] = useState(false);
  const [nukeResult, setNukeResult] = useState<string | null>(null);
  const [step, setStep] = useState<"connect" | "sign" | "dashboard">("connect");

  // ── Settings state ────────────────────────────────────────────────
  const [feeCollectorAddress, setFeeCollectorAddress] = useState("");
  const [feeCollectorInput, setFeeCollectorInput] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // ── Connect wallet ──────────────────────────────────────────────
  const handleConnect = useCallback(async () => {
    setError(null);
    try {
      const addr = await connectWallet();
      setWalletAddress(addr);

      if (addr.toLowerCase() !== ADMIN_ADDRESS.toLowerCase()) {
        setError(`Connected address ${shortAddr(addr)} is not the admin.`);
        return;
      }
      setStep("sign");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    }
  }, []);

  // ── Sign authentication message ────────────────────────────────
  const handleSign = useCallback(async () => {
    if (!walletAddress) return;
    setError(null);
    try {
      const message = `Nexus Bridge Admin Access | Timestamp: ${Date.now()}`;
      const signature = await signMessage(message, walletAddress);
      setAuth({ address: walletAddress, message, signature });
      setStep("dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signature rejected");
    }
  }, [walletAddress]);

  // ── Fetch sessions ─────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    if (!auth) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sessions", {
        headers: {
          "x-admin-signature": auth.signature,
          "x-admin-message": auth.message,
          "x-admin-address": auth.address,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSessions(data.sessions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch sessions");
    } finally {
      setLoading(false);
    }
  }, [auth]);

  // ── Delete session ─────────────────────────────────────────────
  const handleDelete = useCallback(
    async (address: string) => {
      if (!auth) return;
      if (!confirm(`Delete session for ${shortAddr(address)}?`)) return;
      setDeleting(address);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/sessions?address=${encodeURIComponent(address)}`,
          {
            method: "DELETE",
            headers: {
              "x-admin-signature": auth.signature,
              "x-admin-message": auth.message,
              "x-admin-address": auth.address,
            },
          },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setSessions((prev) => prev.filter((s) => s.walletAddress !== address.toLowerCase()));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      } finally {
        setDeleting(null);
      }
    },
    [auth],
  );

  // ── Nuke all data ──────────────────────────────────────────────
  const handleNuke = useCallback(async () => {
    if (!auth) return;
    setNuking(true);
    setError(null);
    setNukeResult(null);
    try {
      const res = await fetch("/api/admin/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-signature": auth.signature,
          "x-admin-message": auth.message,
          "x-admin-address": auth.address,
        },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSessions([]);
      setNukeConfirm(false);
      setNukeResult(
        `All data wiped successfully. ${data.sessionsWiped ?? 0} session(s) removed.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nuke failed");
    } finally {
      setNuking(false);
    }
  }, [auth]);

  // ── Fetch settings ─────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    if (!auth) return;
    try {
      const res = await fetch("/api/admin/settings", {
        headers: {
          "x-admin-signature": auth.signature,
          "x-admin-message": auth.message,
          "x-admin-address": auth.address,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setFeeCollectorAddress(data.feeCollectorAddress ?? "");
      setFeeCollectorInput(data.feeCollectorAddress ?? "");
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    }
  }, [auth]);

  // ── Save fee collector address ────────────────────────────────
  const handleSaveSettings = useCallback(async () => {
    if (!auth) return;
    setSavingSettings(true);
    setSettingsSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-signature": auth.signature,
          "x-admin-message": auth.message,
          "x-admin-address": auth.address,
        },
        body: JSON.stringify({ feeCollectorAddress: feeCollectorInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setFeeCollectorAddress(data.feeCollectorAddress ?? feeCollectorInput);
      setFeeCollectorInput(data.feeCollectorAddress ?? feeCollectorInput);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  }, [auth, feeCollectorInput]);

  // ── Disconnect ─────────────────────────────────────────────────
  const handleDisconnect = useCallback(() => {
    setWalletAddress(null);
    setAuth(null);
    setSessions([]);
    setStep("connect");
    setError(null);
  }, []);

  // Auto-fetch when authed
  useEffect(() => {
    if (auth) {
      fetchSessions();
      fetchSettings();
    }
  }, [auth, fetchSessions, fetchSettings]);

  return (
    <div className="admin-page">
      <div className="admin-bg-glow" aria-hidden="true" />

      {/* ── Top bar ───────────────────────────────────── */}
      <div className="admin-topbar">
        <div className="topbar-brand">
          <div className="brand-icon">
            <Shield size={16} />
          </div>
          <span className="brand-name">Admin Panel</span>
        </div>
        {walletAddress && (
          <div className="topbar-actions">
            <span className="chip-addr">
              <span className="chip-dot" />
              {shortAddr(walletAddress)}
            </span>
            <button className="btn-ghost" onClick={handleDisconnect}>
              <LogOut size={14} />
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* ── Error banner ──────────────────────────────── */}
      {error && (
        <div className="admin-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button className="admin-error-dismiss" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      {/* ── Step: Connect ─────────────────────────────── */}
      {step === "connect" && (
        <div className="admin-center">
          <div className="admin-card admin-card--auth">
            <div className="admin-auth-icon">
              <Wallet size={28} />
            </div>
            <h1 className="admin-auth-title">Admin Access</h1>
            <p className="admin-auth-desc">
              Connect your extension wallet (MetaMask, Rabby) and sign a message
              to verify you are the admin.
            </p>
            <p className="admin-auth-address">
              Required: <code>{shortAddr(ADMIN_ADDRESS)}</code>
            </p>
            <button className="btn-primary admin-auth-btn" onClick={handleConnect}>
              <Wallet size={16} />
              Connect Wallet
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Sign ────────────────────────────────── */}
      {step === "sign" && (
        <div className="admin-center">
          <div className="admin-card admin-card--auth">
            <div className="admin-auth-icon admin-auth-icon--sign">
              <PenLine size={28} />
            </div>
            <h1 className="admin-auth-title">Sign Message</h1>
            <p className="admin-auth-desc">
              Sign a message with your wallet to prove you own the admin address.
              This does not cost any gas.
            </p>
            <button className="btn-primary admin-auth-btn" onClick={handleSign}>
              <PenLine size={16} />
              Sign Message
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Dashboard ───────────────────────────── */}
      {step === "dashboard" && (
        <div className="admin-dashboard">
          {/* Header */}
          <div className="admin-dash-header">
            <div>
              <h1 className="admin-dash-title">Active Sessions</h1>
              <p className="admin-dash-sub">
                {sessions.length} session{sessions.length !== 1 ? "s" : ""} registered
              </p>
            </div>
            <button
              className="admin-refresh-btn"
              onClick={fetchSessions}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? "icon-spin" : ""} />
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>

          {/* Empty state */}
          {!loading && sessions.length === 0 && (
            <div className="admin-card admin-empty">
              <Radio size={24} />
              <p>No active sessions found.</p>
            </div>
          )}

          {/* Sessions list */}
          {sessions.length > 0 && (
            <div className="admin-sessions-list">
              {sessions.map((s) => (
                <div key={s.walletAddress} className="admin-session-card">
                  <div className="admin-session-header">
                    <div className="admin-session-status">
                      {s.active ? (
                        <CheckCircle size={16} className="admin-status-active" />
                      ) : (
                        <XCircle size={16} className="admin-status-inactive" />
                      )}
                      <span className="admin-session-addr">
                        {s.walletAddress}
                      </span>
                    </div>
                    <button
                      className="admin-delete-btn"
                      onClick={() => handleDelete(s.walletAddress)}
                      disabled={deleting === s.walletAddress}
                    >
                      {deleting === s.walletAddress ? (
                        <RefreshCw size={14} className="icon-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                      {deleting === s.walletAddress ? "Deleting…" : "Delete"}
                    </button>
                  </div>

                  <div className="admin-session-grid">
                    <div className="admin-session-field">
                      <span className="admin-field-label">Signer</span>
                      <span className="admin-field-value admin-field-value--mono">
                        {shortAddr(s.sessionSignerAddress)}
                      </span>
                    </div>
                    <div className="admin-session-field">
                      <span className="admin-field-label">Destination</span>
                      <span className="admin-field-value">
                        <span
                          className="admin-chain-dot"
                          style={{ background: CHAIN_META[s.listeningConfig.destChainId]?.color ?? "#888" }}
                        />
                        {chainLabel(s.listeningConfig.destChainId)}
                      </span>
                    </div>
                    <div className="admin-session-field">
                      <span className="admin-field-label">Recipient</span>
                      <span className="admin-field-value admin-field-value--mono">
                        {s.listeningConfig.recipientIsSelf
                          ? "Self"
                          : shortAddr(s.listeningConfig.recipientAddr)}
                      </span>
                    </div>
                    <div className="admin-session-field">
                      <span className="admin-field-label">Version</span>
                      <span className="admin-field-value">v{s.sessionVersion}</span>
                    </div>
                    <div className="admin-session-field">
                      <span className="admin-field-label">Registered</span>
                      <span className="admin-field-value">
                        {new Date(s.registeredAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="admin-session-field">
                      <span className="admin-field-label">Last Poll</span>
                      <span className="admin-field-value">
                        {s.lastPollAt
                          ? new Date(s.lastPollAt).toLocaleString()
                          : "Never"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Settings: Fee Collector ─────────────────────── */}
          <div className="admin-settings-section">
            <div className="admin-settings-header">
              <div className="admin-settings-title-row">
                <Settings size={18} />
                <h2 className="admin-settings-title">Settings</h2>
              </div>
              <p className="admin-settings-desc">
                Configure the fee collector address for cross-token bridge fees (10 bps).
                Caps: 20 USDC, 20 USDT, 0.01 WETH per transfer.
              </p>
            </div>

            <div className="admin-settings-field">
              <label className="admin-settings-label" htmlFor="feeCollector">
                Fee Collector Address
              </label>
              <div className="admin-settings-input-row">
                <input
                  id="feeCollector"
                  type="text"
                  className="admin-settings-input"
                  value={feeCollectorInput}
                  onChange={(e) => setFeeCollectorInput(e.target.value)}
                  placeholder="0x…"
                  spellCheck={false}
                />
                <button
                  className="admin-settings-save-btn"
                  onClick={handleSaveSettings}
                  disabled={
                    savingSettings ||
                    feeCollectorInput.toLowerCase() === feeCollectorAddress.toLowerCase()
                  }
                >
                  {savingSettings ? (
                    <RefreshCw size={14} className="icon-spin" />
                  ) : settingsSaved ? (
                    <CheckCircle size={14} />
                  ) : (
                    <Save size={14} />
                  )}
                  {savingSettings ? "Saving…" : settingsSaved ? "Saved" : "Save"}
                </button>
              </div>
              {feeCollectorAddress && (
                <p className="admin-settings-current">
                  Current: <code>{feeCollectorAddress}</code>
                </p>
              )}
            </div>
          </div>

          {/* ── Danger zone: Nuke all data ─────────────────── */}
          <div className="admin-nuke-section">
            <div className="admin-nuke-header">
              <h2 className="admin-nuke-title">Danger Zone</h2>
              <p className="admin-nuke-desc">
                Permanently delete all data from Redis — sessions, history, and
                every stored key. This action cannot be undone.
              </p>
            </div>

            {nukeResult && (
              <div className="admin-nuke-result">
                <CheckCircle size={16} />
                <span>{nukeResult}</span>
                <button
                  className="admin-error-dismiss"
                  onClick={() => setNukeResult(null)}
                >
                  ✕
                </button>
              </div>
            )}

            {!nukeConfirm ? (
              <button
                className="admin-nuke-btn"
                onClick={() => setNukeConfirm(true)}
              >
                <Bomb size={16} />
                Delete All Data
              </button>
            ) : (
              <div className="admin-nuke-confirm">
                <p className="admin-nuke-confirm-text">
                  Are you absolutely sure? This will wipe <strong>everything</strong>.
                </p>
                <div className="admin-nuke-confirm-actions">
                  <button
                    className="admin-nuke-btn admin-nuke-btn--confirm"
                    onClick={handleNuke}
                    disabled={nuking}
                  >
                    {nuking ? (
                      <RefreshCw size={14} className="icon-spin" />
                    ) : (
                      <Bomb size={14} />
                    )}
                    {nuking ? "Wiping…" : "Yes, wipe everything"}
                  </button>
                  <button
                    className="admin-nuke-cancel-btn"
                    onClick={() => setNukeConfirm(false)}
                    disabled={nuking}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

