import { useState, useRef, useEffect } from "react";
import {
  usePrivy,
  useWallets,
  useSign7702Authorization,
} from "@privy-io/react-auth";
import {
  toMultichainNexusAccount,
  getMEEVersion,
  MEEVersion,
} from "@biconomy/abstractjs";
import { http, parseUnits, type Hash } from "viem";
import { arbitrum, base, optimism, polygon } from "viem/chains";
import type { MultichainSmartAccount } from "@biconomy/abstractjs";
import type { SignAuthorizationReturnType } from "viem/accounts";
import {
  createSessionSigner,
  createSmartSessionModule,
  createSessionMeeClient,
  deployAccount,
  installSessionModule,
  grantDepositV3Permission,
  executeDepositV3,
  type SessionDetails,
} from "./sessions/index";
import { NEXUS_SINGLETON, SUPPORTED_CHAINS } from "./config";
import {
  ArrowLeftRight,
  Wallet,
  Globe,
  PenLine,
  Layers,
  Rocket,
  KeyRound,
  ShieldCheck,
  Send,
  FileCheck2,
  Check,
  Copy,
  LogOut,
  AlertTriangle,
  CircleCheck,
  Loader2,
  ChevronDown,
} from "lucide-react";
import "./App.css";

type Status = "idle" | "loading" | "success" | "error";
type StepStatus = "completed" | "active" | "pending" | "error";

/* Chain metadata — brand colors for each chain */
const CHAIN_META: Record<number, { name: string; color: string }> = {
  [optimism.id]: { name: "Optimism", color: "#FF0420" },
  [base.id]:     { name: "Base",     color: "#0052FF" },
  [polygon.id]:  { name: "Polygon",  color: "#8247E5" },
  [arbitrum.id]: { name: "Arbitrum", color: "#12AAFF" },
};

/* Destination chain options (everything except Arbitrum which is the source) */
const DEST_CHAINS = SUPPORTED_CHAINS.filter((c) => c.id !== arbitrum.id);

/* Step icon themes — colorful accent for each step (9 steps) */
const STEP_THEMES: { bg: string; fg: string; icon: React.ElementType }[] = [
  { bg: "#EFF6FF", fg: "#3B82F6", icon: Wallet },
  { bg: "#F0FDFA", fg: "#14B8A6", icon: Globe },
  { bg: "#F5F3FF", fg: "#8B5CF6", icon: PenLine },
  { bg: "#ECFEFF", fg: "#06B6D4", icon: Layers },
  { bg: "#FFF7ED", fg: "#F97316", icon: Rocket },
  { bg: "#FDF2F8", fg: "#EC4899", icon: KeyRound },
  { bg: "#ECFDF5", fg: "#10B981", icon: ShieldCheck },
  { bg: "#EEF2FF", fg: "#6366F1", icon: Send },
  { bg: "#FFFBEB", fg: "#D97706", icon: FileCheck2 },
];

function App() {
  const { login, logout, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { signAuthorization } = useSign7702Authorization();

  // Core state
  const [nexusAccount, setNexusAccount] =
    useState<MultichainSmartAccount | null>(null);
  const [authorization, setAuthorization] =
    useState<SignAuthorizationReturnType | null>(null);
  const [sessionDetails, setSessionDetails] =
    useState<SessionDetails | null>(null);
  const [sessionSignerAddress, setSessionSignerAddress] = useState<
    string | null
  >(null);

  // Status for each step
  const [authStatus, setAuthStatus] = useState<Status>("idle");
  const [setupStatus, setSetupStatus] = useState<Status>("idle");
  const [deployStatus, setDeployStatus] = useState<Status>("idle");
  const [installStatus, setInstallStatus] = useState<Status>("idle");
  const [grantStatus, setGrantStatus] = useState<Status>("idle");
  const [execStatus, setExecStatus] = useState<Status>("idle");
  const [txHash, setTxHash] = useState<Hash | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Destination chain
  const [destChainId, setDestChainId] = useState(base.id);
  const [destConfirmed, setDestConfirmed] = useState(false);
  const [chainDropdownOpen, setChainDropdownOpen] = useState(false);
  const chainDropdownRef = useRef<HTMLDivElement>(null);
  const chainTriggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  // Copy address state
  const [copied, setCopied] = useState(false);

  // Refs to hold session objects across renders
  const meeClientRef = useRef<any>(null);
  const sessionMeeClientRef = useRef<any>(null);
  const sessionModuleRef = useRef<any>(null);

  // Refs for auto-scrolling the pipeline
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isFirstScroll = useRef(true);

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");

  // ─── Copy address handler ─────────────────────────────────────────
  const handleCopyAddress = async () => {
    if (!embeddedWallet) return;
    try {
      await navigator.clipboard.writeText(embeddedWallet.address);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = embeddedWallet.address;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Step 3: Sign EIP-7702 authorization ─────────────────────────
  const handleSignAuthorization = async () => {
    if (!embeddedWallet) return;
    setAuthStatus("loading");
    setError(null);

    try {
      const auth = await signAuthorization(
        { contractAddress: NEXUS_SINGLETON, chainId: 0 },
        { address: embeddedWallet.address }
      );
      setAuthorization(auth as SignAuthorizationReturnType);
      setAuthStatus("success");
    } catch (err) {
      console.error("Failed to sign authorization:", err);
      setError(
        err instanceof Error ? err.message : "Failed to sign authorization"
      );
      setAuthStatus("error");
    }
  };

  // ─── Step 4: Initialize Nexus account + MEE client ────────────────
  const handleSetupNexus = async () => {
    if (!embeddedWallet || !authorization) return;
    setSetupStatus("loading");
    setError(null);

    try {
      const provider = await embeddedWallet.getEthereumProvider();
      const address = embeddedWallet.address as `0x${string}`;

      const { mcAccount, meeClient, sessionMeeClient } =
        await createSessionMeeClient(provider, address, authorization);

      setNexusAccount(mcAccount);
      meeClientRef.current = meeClient;
      sessionMeeClientRef.current = sessionMeeClient;
      setSetupStatus("success");
    } catch (err) {
      console.error("Failed to setup Nexus account:", err);
      setError(
        err instanceof Error ? err.message : "Failed to setup Nexus account"
      );
      setSetupStatus("error");
    }
  };

  // ─── Step 5: Deploy account on all chains ─────────────────────────
  const handleDeployAccount = async () => {
    if (!meeClientRef.current || !embeddedWallet || !authorization) return;
    setDeployStatus("loading");
    setError(null);

    try {
      await deployAccount({
        meeClient: meeClientRef.current,
        walletAddress: embeddedWallet.address as `0x${string}`,
        authorization,
      });
      setDeployStatus("success");
    } catch (err) {
      console.error("Failed to deploy account:", err);
      setError(
        err instanceof Error ? err.message : "Failed to deploy account"
      );
      setDeployStatus("error");
    }
  };

  // ─── Step 6: Install Smart Sessions module ───────────────────────
  const handleInstallSessions = async () => {
    if (!sessionMeeClientRef.current || !authorization) return;
    setInstallStatus("loading");
    setError(null);

    try {
      const { sessionSigner } = createSessionSigner();
      setSessionSignerAddress(sessionSigner.address);

      const ssModule = createSmartSessionModule(sessionSigner);
      sessionModuleRef.current = ssModule;

      await installSessionModule({
        sessionMeeClient: sessionMeeClientRef.current,
        smartSessionsValidator: ssModule,
        authorization,
      });

      setInstallStatus("success");
    } catch (err) {
      console.error("Failed to install sessions module:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to install sessions module"
      );
      setInstallStatus("error");
    }
  };

  // ─── Step 7: Grant depositV3 permission ──────────────────────────
  const handleGrantPermission = async () => {
    if (!sessionMeeClientRef.current || !sessionSignerAddress) return;
    setGrantStatus("loading");
    setError(null);

    try {
      const details = await grantDepositV3Permission({
        sessionMeeClient: sessionMeeClientRef.current,
        sessionSignerAddress: sessionSignerAddress as `0x${string}`,
        chainIds: SUPPORTED_CHAINS.map((c) => c.id),
      });

      setSessionDetails(details);
      setGrantStatus("success");
    } catch (err) {
      console.error("Failed to grant permission:", err);
      setError(
        err instanceof Error ? err.message : "Failed to grant permission"
      );
      setGrantStatus("error");
    }
  };

  // ─── Close chain dropdown on outside click ────────────────────────
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        chainDropdownRef.current &&
        !chainDropdownRef.current.contains(e.target as Node) &&
        chainTriggerRef.current &&
        !chainTriggerRef.current.contains(e.target as Node)
      ) {
        setChainDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ─── Position the fixed dropdown relative to trigger ────────────────
  useEffect(() => {
    if (chainDropdownOpen && chainTriggerRef.current) {
      const rect = chainTriggerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 6,
        left: rect.left + rect.width / 2,
      });
    }
  }, [chainDropdownOpen]);

  // ─── Step 8: Execute depositV3 via session ────────────────────────
  const handleExecuteDeposit = async () => {
    if (!sessionMeeClientRef.current || !sessionDetails || !embeddedWallet)
      return;
    setExecStatus("loading");
    setError(null);

    try {
      const result = await executeDepositV3({
        sessionMeeClient: sessionMeeClientRef.current,
        sessionDetails,
        walletAddress: embeddedWallet.address as `0x${string}`,
        sourceChainId: arbitrum.id,
        destinationChainId: destChainId,
        amount: parseUnits("1", 6),
      });

      setTxHash(result.hash);
      setExecStatus("success");
      console.log("Supertransaction hash:", result.hash);
    } catch (err) {
      console.error("Failed to execute depositV3:", err);
      setError(
        err instanceof Error ? err.message : "Failed to execute depositV3"
      );
      setExecStatus("error");
    }
  };

  // ─── Auto-advance through steps ─────────────────────────────────
  useEffect(() => {
    if (destConfirmed && embeddedWallet && authStatus === "idle") {
      handleSignAuthorization();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destConfirmed, embeddedWallet, authStatus]);

  useEffect(() => {
    if (authStatus === "success" && setupStatus === "idle") {
      handleSetupNexus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, setupStatus]);

  useEffect(() => {
    if (setupStatus === "success" && authorization && deployStatus === "idle") {
      handleDeployAccount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupStatus, authorization, deployStatus]);

  useEffect(() => {
    if (deployStatus === "success" && installStatus === "idle") {
      handleInstallSessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployStatus, installStatus]);

  useEffect(() => {
    if (installStatus === "success" && grantStatus === "idle") {
      handleGrantPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installStatus, grantStatus]);

  useEffect(() => {
    if (grantStatus === "success" && sessionDetails && execStatus === "idle") {
      handleExecuteDeposit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantStatus, sessionDetails, execStatus]);

  // ─── Helpers ──────────────────────────────────────────────────────
  const shortAddr = (addr: string) =>
    `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  const deriveStatus = (
    ready: boolean,
    status: Status,
    isLoginStep?: boolean
  ): StepStatus => {
    if (isLoginStep) return authenticated ? "completed" : "active";
    if (!ready) return "pending";
    if (status === "error") return "error";
    if (status === "success") return "completed";
    return "active";
  };

  // ─── Step status derivation (9 steps) ─────────────────────────────
  const s1 = deriveStatus(true, "idle", true);
  const s2: StepStatus = !authenticated
    ? "pending"
    : destConfirmed
      ? "completed"
      : "active";
  const s3 = deriveStatus(
    !!authenticated && !!embeddedWallet && destConfirmed,
    authStatus
  );
  const s4 = deriveStatus(authStatus === "success", setupStatus);
  const s5 = deriveStatus(
    setupStatus === "success" && !!authorization,
    deployStatus
  );
  const s6 = deriveStatus(deployStatus === "success", installStatus);
  const s7 = deriveStatus(installStatus === "success", grantStatus);
  const s8 = deriveStatus(
    grantStatus === "success" && !!sessionDetails,
    execStatus
  );
  const s9: StepStatus = txHash
    ? "completed"
    : execStatus === "success"
      ? "active"
      : "pending";

  const stepStatuses = [s1, s2, s3, s4, s5, s6, s7, s8, s9];
  const activeIdx = stepStatuses.findIndex(
    (s) => s === "active" || s === "error"
  );
  const currentStepIndex =
    activeIdx !== -1
      ? activeIdx
      : Math.max(0, stepStatuses.lastIndexOf("completed"));

  const completedCount = stepStatuses.filter((s) => s === "completed").length;
  const progress = (completedCount / stepStatuses.length) * 100;

  // ─── Auto-scroll active step to center ────────────────────────────
  useEffect(() => {
    const el = stepRefs.current[currentStepIndex];
    if (el) {
      el.scrollIntoView({
        behavior: isFirstScroll.current ? "auto" : "smooth",
        inline: "center",
        block: "nearest",
      });
      isFirstScroll.current = false;
    }
  }, [currentStepIndex]);

  // ─── Render helpers ───────────────────────────────────────────────
  const markerContent = (status: StepStatus, num: string) =>
    status === "completed" ? <Check size={14} strokeWidth={3} /> : num;

  const renderCardIcon = (index: number) => {
    const theme = STEP_THEMES[index];
    const Icon = theme.icon;
    return (
      <span
        className="card-icon"
        style={{ backgroundColor: theme.bg, color: theme.fg }}
      >
        <Icon size={15} />
      </span>
    );
  };

  const renderStepIndicator = (
    status: Status,
    loadingLabel: string,
    doneLabel: string,
    doneValue?: string
  ) => {
    if (status === "success") {
      return (
        <div className="done-row">
          <span className="done-badge">
            <Check size={11} strokeWidth={3} />
            {doneLabel}
          </span>
          {doneValue && <span className="done-value">{doneValue}</span>}
        </div>
      );
    }
    if (status === "loading") {
      return (
        <div className="step-running">
          <Loader2 size={14} className="icon-spin" />
          <span>{loadingLabel}</span>
        </div>
      );
    }
    return (
      <div className="step-waiting">
        <span>Waiting…</span>
      </div>
    );
  };

  // ────────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* Ambient glow */}
      <div className="bg-glow" aria-hidden="true" />

      {/* Progress bar */}
      <div className="progress-track" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* ── Top Bar ─────────────────────────────── */}
      <nav className="topbar">
        <div className="topbar-brand">
          <span className="brand-icon">
            <ArrowLeftRight size={16} />
          </span>
          <span className="brand-name">Nexus Bridge</span>
        </div>
        {authenticated && embeddedWallet ? (
          <div className="topbar-actions">
            <button
              className={`chip-addr${copied ? " chip-addr--copied" : ""}`}
              onClick={handleCopyAddress}
            >
              <span className="chip-dot" />
              {copied ? "Copied" : shortAddr(embeddedWallet.address)}
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
            <button className="btn-ghost" onClick={logout}>
              <LogOut size={13} />
              Disconnect
            </button>
          </div>
        ) : null}
      </nav>

      {/* ── Hero ─────────────────────────────────── */}
      <header className="hero">
        <h1 className="hero-heading">Universal Deposit Address</h1>
        <p className="hero-sub">
          Cross-chain USDC bridging via Across Protocol
          {" · "}
          {completedCount < 9
            ? `Step ${Math.min(currentStepIndex + 1, 9)} of 9`
            : "Complete"}
        </p>
        {authenticated && embeddedWallet && (
          <p className="hero-address">{embeddedWallet.address}</p>
        )}
      </header>

      {/* ── Pipeline ─────────────────────────────── */}
      <section className="pipeline-section">
        <div className="pipeline-viewport">
          <div className="pipeline">

            {/* Step 1 — Connect Wallet */}
            <div className="step" data-status={s1} ref={(el) => { stepRefs.current[0] = el; }}>
              <div className="step-marker">
                <div className="step-num">{markerContent(s1, "1")}</div>
              </div>
              <div className="step-card">
                <div className="card-header">
                  {renderCardIcon(0)}
                  <h3 className="card-title">Connect Wallet</h3>
                </div>
                <p className="card-desc">
                  Authenticate via Privy to provision an embedded wallet.
                </p>
                <div className="card-action">
                  {!authenticated ? (
                    <button className="btn-primary" onClick={login}>
                      <Wallet size={14} />
                      Connect with Privy
                    </button>
                  ) : (
                    <div className="done-row">
                      <span className="done-badge">
                        <Check size={11} strokeWidth={3} />
                        Connected
                      </span>
                      <span className="done-value">
                        {embeddedWallet
                          ? shortAddr(embeddedWallet.address)
                          : "Waiting…"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 2 — Select Destination Chain */}
            <div className="step" data-status={s2} ref={(el) => { stepRefs.current[1] = el; }}>
              <div className="step-marker">
                <div className="step-num">{markerContent(s2, "2")}</div>
              </div>
              <div className="step-card">
                <div className="card-header">
                  {renderCardIcon(1)}
                  <h3 className="card-title">Select Destination</h3>
                </div>
                <p className="card-desc">
                  Choose which chain to receive your USDC on.
                  Funds are bridged automatically via Across Protocol.
                </p>
                <div className="card-action">
                  {!destConfirmed ? (
                    <div className="chain-step-action">
                      <div className="chain-select">
                        <button
                          ref={chainTriggerRef}
                          className="chain-select-trigger"
                          onClick={() => setChainDropdownOpen((o) => !o)}
                          disabled={s2 === "pending"}
                        >
                          <span
                            className="chain-dot-lg"
                            style={{ background: CHAIN_META[destChainId].color }}
                          />
                          <span className="chain-select-name">
                            {CHAIN_META[destChainId].name}
                          </span>
                          <ChevronDown
                            size={15}
                            className={`chain-chevron${chainDropdownOpen ? " chain-chevron--open" : ""}`}
                          />
                        </button>
                        {chainDropdownOpen && dropdownPos && (
                          <div
                            ref={chainDropdownRef}
                            className="chain-dropdown"
                            style={{
                              top: dropdownPos.top,
                              left: dropdownPos.left,
                              transform: "translateX(-50%)",
                            }}
                          >
                            {DEST_CHAINS.map((chain) => (
                              <button
                                key={chain.id}
                                className={`chain-option${chain.id === destChainId ? " chain-option--active" : ""}`}
                                onClick={() => {
                                  setDestChainId(chain.id);
                                  setChainDropdownOpen(false);
                                }}
                              >
                                <span
                                  className="chain-dot-lg"
                                  style={{ background: CHAIN_META[chain.id].color }}
                                />
                                <span>{CHAIN_META[chain.id].name}</span>
                                {chain.id === destChainId && (
                                  <Check size={14} className="chain-option-check" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        className="btn-primary"
                        onClick={() => setDestConfirmed(true)}
                        disabled={s2 === "pending"}
                      >
                        Continue
                      </button>
                    </div>
                  ) : (
                    <div className="done-row">
                      <span className="done-badge">
                        <Check size={11} strokeWidth={3} />
                        Selected
                      </span>
                      <span className="done-value done-value--chain">
                        <span
                          className="chain-dot-sm"
                          style={{ background: CHAIN_META[destChainId].color }}
                        />
                        {CHAIN_META[destChainId].name}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 3 — Sign EIP-7702 */}
            <div className="step" data-status={s3} ref={(el) => { stepRefs.current[2] = el; }}>
              <div className="step-marker">
                <div className="step-num">{markerContent(s3, "3")}</div>
              </div>
              <div className="step-card">
                <div className="card-header">
                  {renderCardIcon(2)}
                  <h3 className="card-title">Sign EIP-7702</h3>
                </div>
                <p className="card-desc">
                  Delegate Nexus smart account logic to your EOA with a
                  universal authorization.
                </p>
                <div className="card-action">
                  {renderStepIndicator(authStatus, "Signing authorization…", "Authorized", "EIP-7702 signed")}
                </div>
              </div>
            </div>

            {/* Step 4 — Initialize Nexus */}
            <div className="step" data-status={s4} ref={(el) => { stepRefs.current[3] = el; }}>
              <div className="step-marker">
                <div className="step-num">{markerContent(s4, "4")}</div>
              </div>
              <div className="step-card">
                <div className="card-header">
                  {renderCardIcon(3)}
                  <h3 className="card-title">Initialize Nexus</h3>
                </div>
                <p className="card-desc">
                  Create a multichain Nexus account across Optimism, Base,
                  Polygon &amp; Arbitrum.
                </p>
                <div className="card-action">
                  {renderStepIndicator(setupStatus, "Initializing…", "Ready", embeddedWallet ? shortAddr(embeddedWallet.address) : undefined)}
                </div>
              </div>
            </div>

            {/* Step 5 — Deploy Account */}
            <div className="step" data-status={s5} ref={(el) => { stepRefs.current[4] = el; }}>
              <div className="step-marker">
                <div className="step-num">{markerContent(s5, "5")}</div>
              </div>
              <div className="step-card">
                <div className="card-header">
                  {renderCardIcon(4)}
                  <h3 className="card-title">Deploy Account</h3>
                </div>
                <p className="card-desc">
                  Broadcast the EIP-7702 delegation on all supported chains.
                </p>
                <div className="card-action">
                  {renderStepIndicator(deployStatus, "Deploying on all chains…", "Deployed", `${SUPPORTED_CHAINS.length} chains active`)}
                </div>
              </div>
            </div>

            {/* Step 6 — Install Sessions */}
            <div className="step" data-status={s6} ref={(el) => { stepRefs.current[5] = el; }}>
              <div className="step-marker">
                <div className="step-num">{markerContent(s6, "6")}</div>
              </div>
              <div className="step-card">
                <div className="card-header">
                  {renderCardIcon(5)}
                  <h3 className="card-title">Install Sessions</h3>
                </div>
                <p className="card-desc">
                  Generate a session signer and install the Smart Sessions
                  module.
                </p>
                <div className="card-action">
                  {renderStepIndicator(installStatus, "Installing module…", "Installed", sessionSignerAddress ? shortAddr(sessionSignerAddress) : undefined)}
                </div>
              </div>
            </div>

            {/* Step 7 — Grant Permission */}
            <div className="step" data-status={s7} ref={(el) => { stepRefs.current[6] = el; }}>
              <div className="step-marker">
                <div className="step-num">{markerContent(s7, "7")}</div>
              </div>
              <div className="step-card">
                <div className="card-header">
                  {renderCardIcon(6)}
                  <h3 className="card-title">Grant Permission</h3>
                </div>
                <p className="card-desc">
                  Authorize the session signer to call{" "}
                  <code>depositV3</code> on Across SpokePool.
                </p>
                <div className="card-action">
                  {renderStepIndicator(grantStatus, "Granting permission…", "Granted", "depositV3 on Across")}
                </div>
              </div>
            </div>

            {/* Step 8 — Execute Bridge */}
            <div className="step" data-status={s8} ref={(el) => { stepRefs.current[7] = el; }}>
              <div className="step-marker">
                <div className="step-num">{markerContent(s8, "8")}</div>
              </div>
              <div className="step-card">
                <div className="card-header">
                  {renderCardIcon(7)}
                  <h3 className="card-title">Execute Bridge</h3>
                </div>
                <p className="card-desc">
                  Bridge 1 USDC from Arbitrum →{" "}
                  {CHAIN_META[destChainId].name} via Across with fully
                  sponsored gas.
                </p>
                <div className="card-action">
                  {renderStepIndicator(execStatus, "Bridging USDC…", "Bridged", txHash ? shortAddr(txHash) : undefined)}
                </div>
              </div>
            </div>

            {/* Step 9 — Receipt */}
            <div className="step" data-status={s9} ref={(el) => { stepRefs.current[8] = el; }}>
              <div className="step-marker">
                <div className="step-num">{markerContent(s9, "9")}</div>
              </div>
              <div className="step-card step-card--receipt">
                <div className="card-header">
                  {renderCardIcon(8)}
                  <h3 className="card-title">Receipt</h3>
                </div>
                {txHash ? (
                  <div className="receipt">
                    <div className="receipt-icon">
                      <CircleCheck size={22} />
                    </div>
                    <p className="receipt-headline">Transfer Confirmed</p>
                    <div className="receipt-grid">
                      <div className="receipt-row">
                        <span className="receipt-label">Route</span>
                        <span className="receipt-val">
                          Arbitrum → {CHAIN_META[destChainId].name}
                        </span>
                      </div>
                      <div className="receipt-row">
                        <span className="receipt-label">Amount</span>
                        <span className="receipt-val receipt-val--highlight">
                          1 USDC
                        </span>
                      </div>
                      <div className="receipt-row">
                        <span className="receipt-label">Wallet</span>
                        <span className="receipt-val receipt-val--mono">
                          {shortAddr(embeddedWallet?.address || "")}
                        </span>
                      </div>
                      <div className="receipt-row">
                        <span className="receipt-label">Session</span>
                        <span className="receipt-val receipt-val--mono">
                          {shortAddr(sessionSignerAddress || "")}
                        </span>
                      </div>
                      <div className="receipt-row">
                        <span className="receipt-label">Tx Hash</span>
                        <span className="receipt-val receipt-val--mono">
                          {shortAddr(txHash)}
                        </span>
                      </div>
                    </div>
                    <div className="receipt-footer">
                      Gas fully sponsored · Session key executed
                    </div>
                  </div>
                ) : (
                  <div className="receipt-waiting">
                    <Loader2 size={14} />
                    Awaiting execution…
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Error Toast ──────────────────────────── */}
      {error && (
        <div className="error-toast">
          <span className="error-toast-icon">
            <AlertTriangle size={16} />
          </span>
          <div className="error-toast-body">
            <span className="error-toast-title">Error</span>
            <span className="error-toast-msg">{error}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
