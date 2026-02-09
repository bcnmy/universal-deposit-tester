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
  const [installStatus, setInstallStatus] = useState<Status>("idle");
  const [grantStatus, setGrantStatus] = useState<Status>("idle");
  const [execStatus, setExecStatus] = useState<Status>("idle");
  const [txHash, setTxHash] = useState<Hash | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Copy address state
  const [copied, setCopied] = useState(false);

  // Refs to hold session objects across renders
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
      // Fallback
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

  // ─── Step 1: Sign EIP-7702 authorization ─────────────────────────
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

  // ─── Step 2: Initialize Nexus account ────────────────────────────
  const handleSetupNexus = async () => {
    if (!embeddedWallet || !authorization) return;
    setSetupStatus("loading");
    setError(null);

    try {
      const provider = await embeddedWallet.getEthereumProvider();
      const address = embeddedWallet.address as `0x${string}`;

      const mcAccount = await toMultichainNexusAccount({
        signer: provider,
        chainConfigurations: SUPPORTED_CHAINS.map((chain) => ({
          chain,
          transport: http(),
          version: getMEEVersion(MEEVersion.V2_1_0),
          accountAddress: address,
        })),
      });

      setNexusAccount(mcAccount);
      setSetupStatus("success");
    } catch (err) {
      console.error("Failed to setup Nexus account:", err);
      setError(
        err instanceof Error ? err.message : "Failed to setup Nexus account"
      );
      setSetupStatus("error");
    }
  };

  // ─── Step 3: Install Smart Sessions module ───────────────────────
  const handleInstallSessions = async () => {
    if (!embeddedWallet || !authorization) return;
    setInstallStatus("loading");
    setError(null);

    try {
      const { sessionSigner } = createSessionSigner();
      setSessionSignerAddress(sessionSigner.address);

      const ssModule = createSmartSessionModule(sessionSigner);
      sessionModuleRef.current = ssModule;

      const provider = await embeddedWallet.getEthereumProvider();
      const address = embeddedWallet.address as `0x${string}`;
      const { sessionMeeClient } = await createSessionMeeClient(
        provider,
        address,
        authorization
      );
      sessionMeeClientRef.current = sessionMeeClient;

      await installSessionModule({
        sessionMeeClient,
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

  // ─── Step 4: Grant depositV3 permission ──────────────────────────
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

  // ─── Step 5: Execute depositV3 via session (Arbitrum → Base) ─────
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
  // After login → auto-trigger EIP-7702 authorization signing
  useEffect(() => {
    if (authenticated && embeddedWallet && authStatus === "idle") {
      handleSignAuthorization();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, embeddedWallet, authStatus]);

  // After authorization signed → auto-initialize Nexus account
  useEffect(() => {
    if (authStatus === "success" && setupStatus === "idle") {
      handleSetupNexus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, setupStatus]);

  // After Nexus initialized → auto-install Smart Sessions module
  useEffect(() => {
    if (setupStatus === "success" && authorization && installStatus === "idle") {
      handleInstallSessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupStatus, authorization, installStatus]);

  // After module installed → auto-grant depositV3 permission
  useEffect(() => {
    if (installStatus === "success" && grantStatus === "idle") {
      handleGrantPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installStatus, grantStatus]);

  // After permission granted → auto-execute depositV3
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
    installStatus
  );
  const s5 = deriveStatus(installStatus === "success", grantStatus);
  const s6 = deriveStatus(
    grantStatus === "success" && !!sessionDetails,
    execStatus
  );
  const s7: StepStatus = txHash ? "completed" : execStatus === "success" ? "active" : "pending";

  const markerLabel = (status: StepStatus, num: string) =>
    status === "completed" ? "✓" : num;

  // ─── Auto-scroll active step to center ────────────────────────────
  const stepStatuses = [s1, s2, s3, s4, s5, s6, s7];
  const activeIdx = stepStatuses.findIndex(
    (s) => s === "active" || s === "error"
  );
  const currentStepIndex =
    activeIdx !== -1
      ? activeIdx
      : Math.max(0, stepStatuses.lastIndexOf("completed"));

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
      {/* ── Header ──────────────────────────────────── */}
      <div className="content content-header">
        <header className="header">
          <div className="header-chip">
            <span className="header-chip-dot" />
            Cross-Chain Bridge
          </div>
          <h1>Universal Deposit Address</h1>
          <p className="header-subtitle">
            Set up cross-chain USDC bridging via Across Protocol in 6 steps.
          </p>
          {authenticated && embeddedWallet && (
            <div className="address-bar">
              <span className="address-label">Your Address</span>
              <div className="address-row">
                <span className="address-text">
                  {embeddedWallet.address}
                </span>
                <button
                  className={`btn-copy${copied ? " btn-copy-success" : ""}`}
                  onClick={handleCopyAddress}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button className="btn btn-sm" onClick={logout}>
                  Logout
                </button>
              </div>
            </div>
          )}
        </header>
      </div>

      {/* ── Pipeline (horizontal scroll) ────────────── */}
      <div className="pipeline-viewport">
        <div className="pipeline">
          {/* Step 1 — Connect Wallet */}
          <div
            className="step"
            data-status={s1}
            ref={(el) => {
              stepRefs.current[0] = el;
            }}
          >
            <div className="step-marker">
              <div className="step-number">{markerLabel(s1, "1")}</div>
            </div>
            <div className="step-card">
              <div className="step-title">Connect Wallet</div>
              <p className="step-desc">
                Authenticate via Privy to provision an embedded wallet.
              </p>
              {!authenticated ? (
                <button className="btn" onClick={login}>
                  Connect with Privy
                </button>
              ) : (
                <div className="status-row">
                  <span className="status-badge status-badge-success">
                    Connected
                  </span>
                  <span className="status-value">
                    {embeddedWallet
                      ? shortAddr(embeddedWallet.address)
                      : "Waiting for wallet…"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Step 2 — Sign EIP-7702 Authorization */}
          <div
            className="step"
            data-status={s2}
            ref={(el) => {
              stepRefs.current[1] = el;
            }}
          >
            <div className="step-marker">
              <div className="step-number">{markerLabel(s2, "2")}</div>
            </div>
            <div className="step-card">
              <div className="step-title">Sign EIP-7702 Authorization</div>
              <p className="step-desc">
                Delegate Nexus smart account logic to your EOA. Using chainId=0
                makes it valid across all chains.
              </p>
              {authStatus !== "success" ? (
                <button
                  className={`btn${authStatus === "loading" ? " btn-loading" : ""}`}
                  onClick={handleSignAuthorization}
                  disabled={authStatus === "loading" || s2 === "pending"}
                >
                  {authStatus === "loading"
                    ? "Signing…"
                    : "Sign Authorization"}
                </button>
              ) : (
                <div className="status-row">
                  <span className="status-badge status-badge-success">
                    Authorized
                  </span>
                  <span className="status-value">
                    EIP-7702 delegation signed
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Step 3 — Initialize Nexus Account */}
          <div
            className="step"
            data-status={s3}
            ref={(el) => {
              stepRefs.current[2] = el;
            }}
          >
            <div className="step-marker">
              <div className="step-number">{markerLabel(s3, "3")}</div>
            </div>
            <div className="step-card">
              <div className="step-title">Initialize Nexus Account</div>
              <p className="step-desc">
                Multichain Nexus across Optimism, Base, Polygon &amp; Arbitrum
                with your EOA in EIP-7702 mode.
              </p>
              {setupStatus !== "success" ? (
                <button
                  className={`btn${setupStatus === "loading" ? " btn-loading" : ""}`}
                  onClick={handleSetupNexus}
                  disabled={setupStatus === "loading" || s3 === "pending"}
                >
                  {setupStatus === "loading"
                    ? "Initializing…"
                    : "Initialize Nexus"}
                </button>
              ) : (
                <div className="status-row">
                  <span className="status-badge status-badge-success">
                    Nexus Ready
                  </span>
                  <span className="status-value">
                    {shortAddr(embeddedWallet!.address)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Step 4 — Install Smart Sessions */}
          <div
            className="step"
            data-status={s4}
            ref={(el) => {
              stepRefs.current[3] = el;
            }}
          >
            <div className="step-marker">
              <div className="step-number">{markerLabel(s4, "4")}</div>
            </div>
            <div className="step-card">
              <div className="step-title">Install Smart Sessions</div>
              <p className="step-desc">
                Generate a session signer and install the Smart Sessions module
                on your Nexus account across all chains.
              </p>
              {installStatus !== "success" ? (
                <button
                  className={`btn${installStatus === "loading" ? " btn-loading" : ""}`}
                  onClick={handleInstallSessions}
                  disabled={installStatus === "loading" || s4 === "pending"}
                >
                  {installStatus === "loading"
                    ? "Installing…"
                    : "Install Sessions Module"}
                </button>
              ) : (
                <div className="status-row">
                  <span className="status-badge status-badge-success">
                    Module Installed
                  </span>
                  {sessionSignerAddress && (
                    <span className="status-value">
                      Session: {shortAddr(sessionSignerAddress)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Step 5 — Grant depositV3 Permission */}
          <div
            className="step"
            data-status={s5}
            ref={(el) => {
              stepRefs.current[4] = el;
            }}
          >
            <div className="step-marker">
              <div className="step-number">{markerLabel(s5, "5")}</div>
            </div>
            <div className="step-card">
              <div className="step-title">
                Grant Across depositV3 Permission
              </div>
              <p className="step-desc">
                Sign a universal action policy granting the session signer
                permission to call <code>depositV3</code> on the Across
                SpokePool across all supported chains.
              </p>
              {grantStatus !== "success" ? (
                <button
                  className={`btn${grantStatus === "loading" ? " btn-loading" : ""}`}
                  onClick={handleGrantPermission}
                  disabled={grantStatus === "loading" || s5 === "pending"}
                >
                  {grantStatus === "loading"
                    ? "Granting…"
                    : "Grant depositV3 Permission"}
                </button>
              ) : (
                <div className="status-row">
                  <span className="status-badge status-badge-success">
                    Permission Granted
                  </span>
                  <span className="status-value">
                    depositV3 on Across SpokePool
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Step 6 — Execute depositV3 */}
          <div
            className="step"
            data-status={s6}
            ref={(el) => {
              stepRefs.current[5] = el;
            }}
          >
            <div className="step-marker">
              <div className="step-number">{markerLabel(s6, "6")}</div>
            </div>
            <div className="step-card">
              <div className="step-title">Execute Across depositV3</div>
              <p className="step-desc">
                Bridge 1 USDC from Arbitrum → Base via the Across SpokePool
                using the session signer. Gas is fully sponsored.
              </p>
              {execStatus !== "success" ? (
                <button
                  className={`btn${execStatus === "loading" ? " btn-loading" : ""}`}
                  onClick={handleExecuteDeposit}
                  disabled={execStatus === "loading" || s6 === "pending"}
                >
                  {execStatus === "loading"
                    ? "Executing…"
                    : "Execute depositV3 — 1 USDC"}
                </button>
              ) : (
                <div className="status-row">
                  <span className="status-badge status-badge-success">
                    Executed
                  </span>
                  {txHash && (
                    <span className="status-value">
                      {txHash.slice(0, 10)}…{txHash.slice(-6)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Step 7 — Receipt */}
          <div
            className="step"
            data-status={s7}
            ref={(el) => {
              stepRefs.current[6] = el;
            }}
          >
            <div className="step-marker">
              <div className="step-number">{markerLabel(s7, "7")}</div>
            </div>
            <div className="step-card step-card-receipt">
              <div className="step-title">Receipt</div>
              <p className="step-desc">
                Transaction details for the cross-chain bridge transfer.
              </p>
              {txHash ? (
                <div className="receipt-content">
                  <div className="receipt-header">
                    <span className="result-header-icon">✓</span>
                    Transfer Submitted
                  </div>
                  <div className="result-fields">
                    <div className="result-field">
                      <span className="result-label">Wallet</span>
                      <span className="result-value">
                        {embeddedWallet?.address}
                      </span>
                    </div>
                    <div className="result-field">
                      <span className="result-label">Session Signer</span>
                      <span className="result-value">
                        {sessionSignerAddress}
                      </span>
                    </div>
                    <div className="result-field">
                      <span className="result-label">Supertransaction</span>
                      <span className="result-value">{txHash}</span>
                    </div>
                  </div>
                  <hr className="result-divider" />
                  <p className="result-summary">
                    <strong>1 USDC</strong> bridged from Arbitrum → Base via
                    Across depositV3, executed by the session signer with fully
                    sponsored gas.
                  </p>
                </div>
              ) : (
                <span className="status-value">
                  Waiting for execution…
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Content ──────────────────────────── */}
      <div className="content content-bottom">
        {/* ── Error Alert ────────────────────────────── */}
        {error && (
          <div className="alert-error">
            <span className="alert-label">Error</span>
            <span className="alert-message">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
