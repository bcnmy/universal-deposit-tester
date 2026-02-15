import { useState, useRef, useEffect, useCallback } from "react";
import {
  usePrivy,
  useWallets,
  useSign7702Authorization,
} from "@privy-io/react-auth";
import { type Hash } from "viem";
import { base } from "viem/chains";
import type { MultichainSmartAccount } from "@biconomy/abstractjs";
import type {
  PrivateKeyAccount,
  SignAuthorizationReturnType,
} from "viem/accounts";
import {
  createSessionSigner,
  createSmartSessionModule,
  createSessionMeeClient,
  installSessionModule,
  grantDepositV3Permission,
  saveSessionKey,
  loadSessionKey,
  clearSessionKey,
  registerSessionOnServer,
  getServerSessionStatus,
  reconfigureServerSession,
  deregisterServerSession,
  type SessionDetails,
} from "../sessions/index";
import { NEXUS_SINGLETON, SUPPORTED_CHAINS } from "../config";
import { isValidAddress, deriveStatus } from "../utils";
import type { Status, StepStatus } from "../types";

// ─────────────────────────────────────────────────────────────────────
//  usePipeline — all pipeline state, handlers, auto-advance effects,
//  listening mode, and derived step statuses in one hook.
//
//  NOTE: All balance monitoring and bridge execution is server-side
//  only (via the cron job at /api/cron/poll). The frontend handles
//  setup (connect → sign → install → grant → register) and then shows
//  server-side monitoring status.
// ─────────────────────────────────────────────────────────────────────

export function usePipeline() {
  const { login, logout, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { signAuthorization } = useSign7702Authorization();

  // ─── Core state ───────────────────────────────────────────────────
  const [, setNexusAccount] =
    useState<MultichainSmartAccount | null>(null);
  const [authorizations, setAuthorizations] =
    useState<SignAuthorizationReturnType[] | null>(null);
  const [sessionDetails, setSessionDetails] =
    useState<SessionDetails | null>(null);
  const [sessionSignerAddress, setSessionSignerAddress] = useState<
    string | null
  >(null);

  // ─── Step statuses ────────────────────────────────────────────────
  const [authStatus, setAuthStatus] = useState<Status>("idle");
  const [setupStatus, setSetupStatus] = useState<Status>("idle");
  const [installStatus, setInstallStatus] = useState<Status>("idle");
  const [grantStatus, setGrantStatus] = useState<Status>("idle");
  const [installTxHash, setInstallTxHash] = useState<Hash | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── Listening mode ───────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false);

  // ─── Server registration ───────────────────────────────────────────
  const [serverRegistered, setServerRegistered] = useState(false);

  // ─── Destination chain ────────────────────────────────────────────
  const [destChainId, setDestChainId] = useState<number>(base.id);
  const [destConfirmed, setDestConfirmed] = useState(false);
  const [chainDropdownOpen, setChainDropdownOpen] = useState(false);
  const chainDropdownRef = useRef<HTMLDivElement>(null);
  const chainTriggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  // ─── Recipient ────────────────────────────────────────────────────
  const [recipientAddr, setRecipientAddr] = useState("");
  const [recipientIsSelf, setRecipientIsSelf] = useState(true);

  // ─── Copy address ─────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);

  // ─── Internal refs ────────────────────────────────────────────────
  const meeClientRef = useRef<any>(null);
  const sessionMeeClientRef = useRef<any>(null);
  const sessionModuleRef = useRef<any>(null);
  const sessionSignerRef = useRef<PrivateKeyAccount | null>(null);

  // ─── Pipeline scroll refs ─────────────────────────────────────────
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isFirstScroll = useRef(true);

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");

  // ─── Derived: effective recipient ─────────────────────────────────
  const effectiveRecipient: `0x${string}` | null = recipientIsSelf
    ? ((embeddedWallet?.address as `0x${string}` | undefined) ?? null)
    : isValidAddress(recipientAddr)
      ? (recipientAddr as `0x${string}`)
      : null;

  // ─── Session check loading state ─────────────────────────────────
  const [checkingSession, setCheckingSession] = useState(false);

  // ═══════════════════════════════════════════════════════════════════
  //  Session restore — server is the single source of truth.
  //
  //  When the wallet connects we query the backend.  If it has an
  //  active session we restore the config from the server response
  //  and jump straight to listening mode.  If not, the user sees the
  //  setup pipeline.
  //
  //  The only localStorage data we touch is the session private key
  //  (used to reuse the same signer if the user refreshes mid-setup).
  // ═══════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!embeddedWallet) return;
    const addr = embeddedWallet.address;

    let cancelled = false;
    setCheckingSession(true);

    // ── 1. Hydrate session signer from localStorage (for mid-pipeline resume) ──
    const savedKey = loadSessionKey(addr);
    if (savedKey && !sessionSignerRef.current) {
      const { sessionSigner } = createSessionSigner(savedKey);
      sessionSignerRef.current = sessionSigner;
      setSessionSignerAddress(sessionSigner.address);
    }

    // ── 2. Query the server (source of truth) ─────────────────────
    getServerSessionStatus(addr)
      .then((status) => {
        if (cancelled) return;

        const registered = status.registered && !!status.active;
        setServerRegistered(registered);

        if (registered && status.listeningConfig) {
          // Server has an active session — restore from server data
          // and jump straight to the listening dashboard.
          const cfg = status.listeningConfig;

          setDestChainId(cfg.destChainId);
          setDestConfirmed(true);
          setRecipientIsSelf(cfg.recipientIsSelf);
          setRecipientAddr(cfg.recipientAddr);

          // Use session signer address from server if we don't have it locally
          if (status.sessionSignerAddress && !sessionSignerRef.current) {
            setSessionSignerAddress(status.sessionSignerAddress);
          }

          setIsListening(true);
        }
        // If server has no active session → user sees setup pipeline (no-op)
      })
      .catch(() => {
        // Server unreachable — user sees setup pipeline.
        // No localStorage fallback; they can retry on next load.
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [embeddedWallet]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════════════
  //  Copy address handler
  // ═══════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════
  //  Step handlers (setup pipeline — steps 1-7)
  // ═══════════════════════════════════════════════════════════════════

  /** Step 3 — Sign EIP-7702 authorizations (one per supported chain) */
  const handleSignAuthorization = async () => {
    if (!embeddedWallet) return;
    setAuthStatus("loading");
    setError(null);
    try {
      const auths: SignAuthorizationReturnType[] = [];

      // Universal (chainId 0) — used for chains that share the same nonce
      const universalAuth = await signAuthorization(
        { contractAddress: NEXUS_SINGLETON, chainId: 0 },
        { address: embeddedWallet.address },
      );
      auths.push(universalAuth as SignAuthorizationReturnType);

      // Per-chain — used for any chain whose nonce diverges
      for (const chain of SUPPORTED_CHAINS) {
        const auth = await signAuthorization(
          { contractAddress: NEXUS_SINGLETON, chainId: chain.id },
          { address: embeddedWallet.address },
        );
        auths.push(auth as SignAuthorizationReturnType);
      }
      setAuthorizations(auths);
      setAuthStatus("success");
    } catch (err) {
      console.error("Failed to sign authorization:", err);
      setError(
        err instanceof Error ? err.message : "Failed to sign authorization",
      );
      setAuthStatus("error");
    }
  };

  /** Step 4 — Initialize Nexus account + MEE client */
  const handleSetupNexus = async () => {
    if (!embeddedWallet || !authorizations) return;
    setSetupStatus("loading");
    setError(null);
    try {
      const provider = await embeddedWallet.getEthereumProvider();
      const address = embeddedWallet.address as `0x${string}`;
      const { mcAccount, meeClient, sessionMeeClient } =
        await createSessionMeeClient(provider, address);
      setNexusAccount(mcAccount);
      meeClientRef.current = meeClient;
      sessionMeeClientRef.current = sessionMeeClient;
      setSetupStatus("success");
    } catch (err) {
      console.error("Failed to setup Nexus account:", err);
      setError(
        err instanceof Error ? err.message : "Failed to setup Nexus account",
      );
      setSetupStatus("error");
    }
  };

  /** Step 5 — Install Smart Sessions module (+ deploy 7702 delegation) */
  const handleInstallSessions = async () => {
    if (!sessionMeeClientRef.current || !authorizations) return;
    setInstallStatus("loading");
    setError(null);
    try {
      const existingKey = embeddedWallet
        ? loadSessionKey(embeddedWallet.address)
        : null;
      const { sessionSigner, sessionPrivateKey } = createSessionSigner(
        existingKey ?? undefined,
      );
      setSessionSignerAddress(sessionSigner.address);
      sessionSignerRef.current = sessionSigner;

      if (embeddedWallet) {
        saveSessionKey(embeddedWallet.address, sessionPrivateKey);
      }

      const ssModule = createSmartSessionModule(sessionSigner);
      sessionModuleRef.current = ssModule;

      const installResult = await installSessionModule({
        sessionMeeClient: sessionMeeClientRef.current,
        smartSessionsValidator: ssModule,
        authorizations,
      });
      if (installResult) setInstallTxHash(installResult.hash);
      setInstallStatus("success");
    } catch (err) {
      console.error("Failed to install sessions module:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to install sessions module",
      );
      setInstallStatus("error");
    }
  };

  /** Step 7 — Grant depositV3 permission */
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
        err instanceof Error ? err.message : "Failed to grant permission",
      );
      setGrantStatus("error");
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  //  Reconfigure — reset session/policy so user can pick a new
  //  destination chain or recipient.  Old session details are wiped;
  //  the next executeDepositV3 will use ENABLE_AND_USE automatically.
  // ═══════════════════════════════════════════════════════════════════

  const handleReconfigure = useCallback(() => {
    // 1. Exit listening mode
    setIsListening(false);

    // 2. Pause server-side monitoring while reconfiguring.
    //    The session key is kept (in localStorage + server) so we
    //    don't have to re-install the sessions module.
    if (embeddedWallet) {
      reconfigureServerSession(embeddedWallet.address, { active: false }).catch(
        () => {},
      );
      setServerRegistered(false);
    }

    // 3. Reset in-memory session details
    setSessionDetails(null);

    // 4. Reset the grant step so the pipeline re-runs it
    setGrantStatus("idle");

    // 5. Re-open destination selection so the user can change chain/recipient
    setDestConfirmed(false);

    // 6. Clear any lingering error
    setError(null);
  }, [embeddedWallet]);

  // ═══════════════════════════════════════════════════════════════════
  //  Delete Session — wipe ALL session data from the server and local
  //  storage.  Monitoring stops immediately.  The user can re-enable
  //  later, but a brand-new session will be signed (since the key is
  //  deleted).
  // ═══════════════════════════════════════════════════════════════════

  const [deleteStatus, setDeleteStatus] = useState<"idle" | "loading" | "done">("idle");

  const handleDeleteSession = useCallback(async () => {
    if (!embeddedWallet) return;

    // Require explicit user confirmation
    const confirmed = window.confirm(
      "Delete all session data?\n\n" +
      "This will stop server-side monitoring and erase your session from the server. " +
      "You can set up a new session afterwards, but you'll need to go through the full setup again.",
    );
    if (!confirmed) return;

    setDeleteStatus("loading");

    try {
      // 1. Delete session from the server
      await deregisterServerSession(embeddedWallet.address);
    } catch (err) {
      console.error("[delete] Failed to deregister from server:", err);
      // Continue with local cleanup even if server call fails
    }

    // 2. Clear local session key
    clearSessionKey(embeddedWallet.address);

    // 3. Exit listening mode
    setIsListening(false);
    setServerRegistered(false);

    // 4. Reset all in-memory state
    setSessionDetails(null);
    setSessionSignerAddress(null);
    sessionSignerRef.current = null;
    sessionModuleRef.current = null;
    meeClientRef.current = null;
    sessionMeeClientRef.current = null;
    setAuthorizations(null);

    // 5. Reset all step statuses so the pipeline starts fresh
    setAuthStatus("idle");
    setSetupStatus("idle");
    setInstallStatus("idle");
    setGrantStatus("idle");
    setInstallTxHash(null);

    // 6. Re-open destination selection
    setDestConfirmed(false);

    // 7. Clear any lingering error
    setError(null);

    setDeleteStatus("done");

    // Reset the "done" flag after a moment
    setTimeout(() => setDeleteStatus("idle"), 2000);
  }, [embeddedWallet]);

  // ═══════════════════════════════════════════════════════════════════
  //  Full Reset & Re-setup — nuclear option: wipes everything (server
  //  + local), then automatically re-runs the entire pipeline with the
  //  current destination/recipient settings.  Useful when the on-chain
  //  state is out of sync (e.g. stale 7702 delegation or corrupted
  //  session details).
  // ═══════════════════════════════════════════════════════════════════

  const [resetStatus, setResetStatus] = useState<"idle" | "loading" | "done">("idle");

  const handleFullReset = useCallback(async () => {
    if (!embeddedWallet) return;

    const confirmed = window.confirm(
      "Full reset & re-setup?\n\n" +
      "This will delete all session data (server + local), generate a new " +
      "session key, re-sign the 7702 authorization, re-install the sessions " +
      "module, and re-grant permissions.\n\n" +
      "The current destination and recipient settings will be preserved.",
    );
    if (!confirmed) return;

    setResetStatus("loading");

    // Remember current config before wiping
    const savedDest = destChainId;
    const savedRecipientIsSelf = recipientIsSelf;
    const savedRecipientAddr = recipientAddr;

    // 1. Deregister from server
    try {
      await deregisterServerSession(embeddedWallet.address);
    } catch (err) {
      console.error("[full-reset] Failed to deregister from server:", err);
    }

    // 2. Clear local session key
    clearSessionKey(embeddedWallet.address);

    // 3. Exit listening mode
    setIsListening(false);
    setServerRegistered(false);

    // 4. Reset all in-memory state
    setSessionDetails(null);
    setSessionSignerAddress(null);
    sessionSignerRef.current = null;
    sessionModuleRef.current = null;
    meeClientRef.current = null;
    sessionMeeClientRef.current = null;
    setAuthorizations(null);

    // 5. Reset all step statuses
    setAuthStatus("idle");
    setSetupStatus("idle");
    setInstallStatus("idle");
    setGrantStatus("idle");
    setInstallTxHash(null);
    setError(null);

    // 6. Restore destination settings and keep destConfirmed=true
    //    so the auto-advance effects immediately re-trigger the pipeline
    //    (sign auth → setup → install → grant → listening).
    setDestChainId(savedDest);
    setRecipientIsSelf(savedRecipientIsSelf);
    setRecipientAddr(savedRecipientAddr);
    setDestConfirmed(true);

    setResetStatus("done");
    setTimeout(() => setResetStatus("idle"), 2000);
  }, [embeddedWallet, destChainId, recipientIsSelf, recipientAddr]);

  // ═══════════════════════════════════════════════════════════════════
  //  Transition to listening mode after setup completes.
  //  Also register the session on the server so the background cron
  //  can keep bridging even when the browser tab is closed.
  // ═══════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (grantStatus === "success" && sessionDetails && destConfirmed && !isListening) {
      // Register on the server (fire-and-forget — don't block the UI)
      if (embeddedWallet && sessionSignerRef.current) {
        const sessionKey = loadSessionKey(embeddedWallet.address);
        if (sessionKey) {
          registerSessionOnServer({
            walletAddress: embeddedWallet.address,
            sessionPrivateKey: sessionKey,
            sessionSignerAddress: sessionSignerRef.current.address,
            sessionDetails,
            listeningConfig: { destChainId, recipientIsSelf, recipientAddr },
          })
            .then(() => {
              setServerRegistered(true);
              console.log("[server] Session registered for background monitoring");
            })
            .catch((err) =>
              console.error("[server] Failed to register session:", err),
            );
        }
      }

      // Small delay so the user can see step 7 complete
      const timer = setTimeout(() => setIsListening(true), 800);
      return () => clearTimeout(timer);
    }
  }, [grantStatus, sessionDetails]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════════════
  //  Auto-advance — each setup step triggers the next when it succeeds
  //  (Steps 3–7 only)
  // ═══════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (destConfirmed && embeddedWallet && authStatus === "idle" && !isListening)
      handleSignAuthorization();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destConfirmed, embeddedWallet, authStatus, isListening]);

  useEffect(() => {
    if (authStatus === "success" && setupStatus === "idle") handleSetupNexus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, setupStatus]);

  useEffect(() => {
    if (setupStatus === "success" && authorizations && installStatus === "idle")
      handleInstallSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupStatus, authorizations, installStatus]);

  useEffect(() => {
    if (destConfirmed && installStatus === "success" && grantStatus === "idle")
      handleGrantPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destConfirmed, installStatus, grantStatus]);

  // ─── Chain dropdown: outside click ────────────────────────────────
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

  // ─── Chain dropdown: position relative to trigger ─────────────────
  useEffect(() => {
    if (chainDropdownOpen && chainTriggerRef.current) {
      const rect = chainTriggerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 6,
        left: rect.left + rect.width / 2,
      });
    }
  }, [chainDropdownOpen]);

  // ═══════════════════════════════════════════════════════════════════
  //  Step status derivation (6 setup steps)
  // ═══════════════════════════════════════════════════════════════════

  const s1 = deriveStatus(true, "idle", true, authenticated);
  const s2: StepStatus = !authenticated
    ? "pending"
    : destConfirmed
      ? "completed"
      : "active";
  const s3 = deriveStatus(
    !!authenticated && !!embeddedWallet && destConfirmed,
    authStatus,
  );
  const s4 = deriveStatus(authStatus === "success", setupStatus);
  const s5 = deriveStatus(
    setupStatus === "success" && !!authorizations,
    installStatus,
  );
  const s6 = deriveStatus(installStatus === "success", grantStatus);

  const stepStatuses: StepStatus[] = [s1, s2, s3, s4, s5, s6];

  const activeIdx = stepStatuses.findIndex(
    (s) => s === "active" || s === "error",
  );
  const currentStepIndex =
    activeIdx !== -1
      ? activeIdx
      : Math.max(0, stepStatuses.lastIndexOf("completed"));

  const completedCount = stepStatuses.filter((s) => s === "completed").length;
  const progress = isListening
    ? 100
    : (completedCount / stepStatuses.length) * 100;

  // ─── Map logical step index → visual ref index ─────────────────────
  // Pipeline renders 3 elements: ConnectWallet (0), SelectDest (1),
  // InitializingCard (2). Steps 3-6 are all behind visual index 2.
  const visualStepIndex =
    currentStepIndex <= 1 ? currentStepIndex : 2;

  // ─── Auto-scroll active step to center ────────────────────────────
  useEffect(() => {
    if (isListening) return; // no pipeline scroll in listening mode
    const el = stepRefs.current[visualStepIndex];
    if (el) {
      el.scrollIntoView({
        behavior: isFirstScroll.current ? "auto" : "smooth",
        inline: "center",
        block: "nearest",
      });
      isFirstScroll.current = false;
    }
  }, [visualStepIndex, isListening]);

  // ═══════════════════════════════════════════════════════════════════
  //  Public API
  // ═══════════════════════════════════════════════════════════════════

  return {
    // Auth
    authenticated,
    login,
    logout,

    // Wallet
    embeddedWallet,

    // Step statuses (raw)
    authStatus,
    setupStatus,
    installStatus,
    grantStatus,

    // Transaction hashes
    installTxHash,

    // Session
    sessionSignerAddress,

    // Error
    error,

    // Destination chain
    destChainId,
    setDestChainId,
    destConfirmed,
    setDestConfirmed,
    chainDropdownOpen,
    setChainDropdownOpen,
    chainDropdownRef,
    chainTriggerRef,
    dropdownPos,

    // Recipient
    recipientAddr,
    setRecipientAddr,
    recipientIsSelf,
    setRecipientIsSelf,

    // Copy
    copied,
    handleCopyAddress,

    // Pipeline status
    stepStatuses,
    currentStepIndex,
    progress,

    // Refs
    stepRefs,

    // ── Listening mode ──────────────────────────────────────────────
    isListening,

    // ── Reconfigure ─────────────────────────────────────────────────
    handleReconfigure,

    // ── Delete session ──────────────────────────────────────────────
    handleDeleteSession,
    deleteStatus,

    // ── Full reset & re-setup ────────────────────────────────────────
    handleFullReset,
    resetStatus,

    // ── Server-side monitoring status ────────────────────────────────
    serverRegistered,

    // ── Session check loading state ──────────────────────────────────
    checkingSession,
  };
}

/** Convenience type for components that consume the pipeline state */
export type PipelineState = ReturnType<typeof usePipeline>;
