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
import { arbitrum, base } from "viem/chains";
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
import "./App.css";

type Status = "idle" | "loading" | "success" | "error";
type StepStatus = "completed" | "active" | "pending" | "error";

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

  // ─── Step 2: Sign EIP-7702 authorization ─────────────────────────
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

  // ─── Step 3: Initialize Nexus account + MEE client ────────────────
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

  // ─── Step 4: Deploy account on all chains ─────────────────────────
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

  // ─── Step 5: Install Smart Sessions module ───────────────────────
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

  // ─── Step 6: Grant depositV3 permission ──────────────────────────
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

  // ─── Step 7: Execute depositV3 via session (Arbitrum → Base) ─────
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
        destinationChainId: base.id,
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

  // ─── Step status derivation ───────────────────────────────────────
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

  const s1 = deriveStatus(true, "idle", true);
  const s2 = deriveStatus(!!authenticated && !!embeddedWallet, authStatus);
  const s3 = deriveStatus(authStatus === "success", setupStatus);
  const s4 = deriveStatus(
    setupStatus === "success" && !!authorization,
    deployStatus
  );
  const s5 = deriveStatus(deployStatus === "success", installStatus);
  const s6 = deriveStatus(installStatus === "success", grantStatus);
  const s7 = deriveStatus(
    grantStatus === "success" && !!sessionDetails,
    execStatus
  );
  const s8: StepStatus = txHash
    ? "completed"
    : execStatus === "success"
      ? "active"
      : "pending";

  const markerLabel = (status: StepStatus, num: string) =>
    status === "completed" ? "✓" : num;

  // ─── Auto-scroll active step to center ────────────────────────────
  const stepStatuses = [s1, s2, s3, s4, s5, s6, s7, s8];
  const activeIdx = stepStatuses.findIndex(
    (s) => s === "active" || s === "error"
  );
  const currentStepIndex =
    activeIdx !== -1
      ? activeIdx
      : Math.max(0, stepStatuses.lastIndexOf("completed"));

  const completedCount = stepStatuses.filter((s) => s === "completed").length;
  const progress = (completedCount / stepStatuses.length) * 100;

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

  // ────────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* Background dot grid */}
      <div className="bg-dots" aria-hidden="true" />

      {/* Progress bar */}
      <div className="progress-track" aria-hidden="true">
        <div
          className="progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* ── Top Bar ─────────────────────────────── */}
      <nav className="topbar">
        <div className="topbar-brand">
          <span className="brand-mark" aria-hidden="true">◆</span>
          <span className="brand-name">NEXUS</span>
        </div>
        {authenticated && embeddedWallet ? (
          <div className="topbar-actions">
            <button
              className={`chip-addr${copied ? " chip-addr--copied" : ""}`}
              onClick={handleCopyAddress}
            >
              <span className="chip-dot" />
              {copied ? "Copied" : shortAddr(embeddedWallet.address)}
            </button>
            <button className="btn-ghost" onClick={logout}>
              Disconnect
            </button>
          </div>
        ) : null}
      </nav>

      {/* ── Hero ─────────────────────────────────── */}
      <header className="hero">
        <h1 className="hero-heading">
          Universal Deposit Address
        </h1>
        <p className="hero-sub">
          Cross-chain USDC bridging via Across Protocol
          {" · "}
          {completedCount < 8
            ? `Step ${Math.min(currentStepIndex + 1, 8)} of 8`
            : "Complete"}
        </p>
      </header>

      {/* ── Pipeline ─────────────────────────────── */}
      <section className="pipeline-section">
        <div className="pipeline-viewport">
          <div className="pipeline">

            {/* Step 1 — Connect Wallet */}
            <div
              className="step"
              data-status={s1}
              ref={(el) => { stepRefs.current[0] = el; }}
            >
              <div className="step-marker">
                <div className="step-num">{markerLabel(s1, "1")}</div>
              </div>
              <div className="step-card" data-step="01">
                <h3 className="card-title">Connect Wallet</h3>
                <p className="card-desc">
                  Authenticate via Privy to provision an embedded wallet.
                </p>
                <div className="card-action">
                  {!authenticated ? (
                    <button className="btn-primary" onClick={login}>
                      Connect with Privy
                    </button>
                  ) : (
                    <div className="done-row">
                      <span className="done-badge">Connected</span>
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

            {/* Step 2 — Sign EIP-7702 */}
            <div
              className="step"
              data-status={s2}
              ref={(el) => { stepRefs.current[1] = el; }}
            >
              <div className="step-marker">
                <div className="step-num">{markerLabel(s2, "2")}</div>
              </div>
              <div className="step-card" data-step="02">
                <h3 className="card-title">Sign EIP-7702</h3>
                <p className="card-desc">
                  Delegate Nexus smart account logic to your EOA with a
                  universal authorization (chainId=0).
                </p>
                <div className="card-action">
                  {authStatus !== "success" ? (
                    <button
                      className={`btn-primary${authStatus === "loading" ? " btn-loading" : ""}`}
                      onClick={handleSignAuthorization}
                      disabled={authStatus === "loading" || s2 === "pending"}
                    >
                      {authStatus === "loading"
                        ? "Signing…"
                        : "Sign Authorization"}
                    </button>
                  ) : (
                    <div className="done-row">
                      <span className="done-badge">Authorized</span>
                      <span className="done-value">EIP-7702 signed</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 3 — Initialize Nexus */}
            <div
              className="step"
              data-status={s3}
              ref={(el) => { stepRefs.current[2] = el; }}
            >
              <div className="step-marker">
                <div className="step-num">{markerLabel(s3, "3")}</div>
              </div>
              <div className="step-card" data-step="03">
                <h3 className="card-title">Initialize Nexus</h3>
                <p className="card-desc">
                  Create a multichain Nexus account across Optimism, Base,
                  Polygon &amp; Arbitrum in EIP-7702 mode.
                </p>
                <div className="card-action">
                  {setupStatus !== "success" ? (
                    <button
                      className={`btn-primary${setupStatus === "loading" ? " btn-loading" : ""}`}
                      onClick={handleSetupNexus}
                      disabled={setupStatus === "loading" || s3 === "pending"}
                    >
                      {setupStatus === "loading"
                        ? "Initializing…"
                        : "Initialize"}
                    </button>
                  ) : (
                    <div className="done-row">
                      <span className="done-badge">Ready</span>
                      <span className="done-value">
                        {shortAddr(embeddedWallet!.address)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 4 — Deploy Account */}
            <div
              className="step"
              data-status={s4}
              ref={(el) => { stepRefs.current[3] = el; }}
            >
              <div className="step-marker">
                <div className="step-num">{markerLabel(s4, "4")}</div>
              </div>
              <div className="step-card" data-step="04">
                <h3 className="card-title">Deploy Account</h3>
                <p className="card-desc">
                  Broadcast the EIP-7702 delegation on all supported chains
                  via an empty supertransaction.
                </p>
                <div className="card-action">
                  {deployStatus !== "success" ? (
                    <button
                      className={`btn-primary${deployStatus === "loading" ? " btn-loading" : ""}`}
                      onClick={handleDeployAccount}
                      disabled={deployStatus === "loading" || s4 === "pending"}
                    >
                      {deployStatus === "loading"
                        ? "Deploying…"
                        : "Deploy All Chains"}
                    </button>
                  ) : (
                    <div className="done-row">
                      <span className="done-badge">Deployed</span>
                      <span className="done-value">
                        {SUPPORTED_CHAINS.length} chains active
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 5 — Install Sessions */}
            <div
              className="step"
              data-status={s5}
              ref={(el) => { stepRefs.current[4] = el; }}
            >
              <div className="step-marker">
                <div className="step-num">{markerLabel(s5, "5")}</div>
              </div>
              <div className="step-card" data-step="05">
                <h3 className="card-title">Install Sessions</h3>
                <p className="card-desc">
                  Generate a session signer and install the Smart Sessions
                  module on your Nexus account.
                </p>
                <div className="card-action">
                  {installStatus !== "success" ? (
                    <button
                      className={`btn-primary${installStatus === "loading" ? " btn-loading" : ""}`}
                      onClick={handleInstallSessions}
                      disabled={installStatus === "loading" || s5 === "pending"}
                    >
                      {installStatus === "loading"
                        ? "Installing…"
                        : "Install Module"}
                    </button>
                  ) : (
                    <div className="done-row">
                      <span className="done-badge">Installed</span>
                      {sessionSignerAddress && (
                        <span className="done-value">
                          {shortAddr(sessionSignerAddress)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 6 — Grant Permission */}
            <div
              className="step"
              data-status={s6}
              ref={(el) => { stepRefs.current[5] = el; }}
            >
              <div className="step-marker">
                <div className="step-num">{markerLabel(s6, "6")}</div>
              </div>
              <div className="step-card" data-step="06">
                <h3 className="card-title">Grant Permission</h3>
                <p className="card-desc">
                  Authorize the session signer to call{" "}
                  <code>depositV3</code> on Across SpokePool across all
                  supported chains.
                </p>
                <div className="card-action">
                  {grantStatus !== "success" ? (
                    <button
                      className={`btn-primary${grantStatus === "loading" ? " btn-loading" : ""}`}
                      onClick={handleGrantPermission}
                      disabled={grantStatus === "loading" || s6 === "pending"}
                    >
                      {grantStatus === "loading"
                        ? "Granting…"
                        : "Grant Permission"}
                    </button>
                  ) : (
                    <div className="done-row">
                      <span className="done-badge">Granted</span>
                      <span className="done-value">depositV3 on Across</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 7 — Execute Bridge */}
            <div
              className="step"
              data-status={s7}
              ref={(el) => { stepRefs.current[6] = el; }}
            >
              <div className="step-marker">
                <div className="step-num">{markerLabel(s7, "7")}</div>
              </div>
              <div className="step-card" data-step="07">
                <h3 className="card-title">Execute Bridge</h3>
                <p className="card-desc">
                  Bridge 1 USDC from Arbitrum → Base via Across depositV3
                  with fully sponsored gas.
                </p>
                <div className="card-action">
                  {execStatus !== "success" ? (
                    <button
                      className={`btn-primary${execStatus === "loading" ? " btn-loading" : ""}`}
                      onClick={handleExecuteDeposit}
                      disabled={execStatus === "loading" || s7 === "pending"}
                    >
                      {execStatus === "loading"
                        ? "Executing…"
                        : "Bridge 1 USDC"}
                    </button>
                  ) : (
                    <div className="done-row">
                      <span className="done-badge">Bridged</span>
                      {txHash && (
                        <span className="done-value">
                          {shortAddr(txHash)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 8 — Receipt */}
            <div
              className="step"
              data-status={s8}
              ref={(el) => { stepRefs.current[7] = el; }}
            >
              <div className="step-marker">
                <div className="step-num">{markerLabel(s8, "8")}</div>
              </div>
              <div className="step-card step-card--receipt" data-step="✦">
                <h3 className="card-title">Receipt</h3>
                {txHash ? (
                  <div className="receipt">
                    <div className="receipt-icon">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </div>
                    <p className="receipt-headline">Transfer Confirmed</p>
                    <div className="receipt-grid">
                      <div className="receipt-row">
                        <span className="receipt-label">Route</span>
                        <span className="receipt-val">Arbitrum → Base</span>
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
                    <span className="waiting-dot" />
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
          <span className="error-toast-mark">!</span>
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
