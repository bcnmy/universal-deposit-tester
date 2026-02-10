import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  usePrivy,
  useWallets,
  useSign7702Authorization,
} from "@privy-io/react-auth";
import { type Hash } from "viem";
import { arbitrum, base } from "viem/chains";
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
  executeDepositV3,
  saveSessionKey,
  loadSessionKey,
  saveSessionDetails,
  loadSessionDetails,
  saveListeningConfig,
  loadListeningConfig,
  clearSession,
  type SessionDetails,
} from "../sessions/index";
import { NEXUS_SINGLETON, SUPPORTED_CHAINS } from "../config";
import { isValidAddress, deriveStatus } from "../utils";
import { useBalanceWatcher, type DetectedDeposit } from "./useBalanceWatcher";
import type { Status, StepStatus } from "../types";

// ─────────────────────────────────────────────────────────────────────
//  Transfer record for the listening dashboard log
// ─────────────────────────────────────────────────────────────────────

export type TransferRecord = {
  sourceChainId: number;
  destinationChainId: number;
  tokenSymbol: string;
  amount: bigint;
  txHash: string;
  timestamp: number;
};

// ─────────────────────────────────────────────────────────────────────
//  usePipeline — all pipeline state, handlers, auto-advance effects,
//  listening mode, and derived step statuses in one hook.
// ─────────────────────────────────────────────────────────────────────

export function usePipeline() {
  const { login, logout, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { signAuthorization } = useSign7702Authorization();

  // ─── Core state ───────────────────────────────────────────────────
  const [nexusAccount, setNexusAccount] =
    useState<MultichainSmartAccount | null>(null);
  const [authorization, setAuthorization] =
    useState<SignAuthorizationReturnType | null>(null);
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
  const [bridgeStatus, setBridgeStatus] = useState<Status>("idle");
  const [bridgingChainId, setBridgingChainId] = useState<number | null>(null);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);

  // ─── Destination chain ────────────────────────────────────────────
  const [destChainId, setDestChainId] = useState(base.id);
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
  const sessionSignerMeeClientRef = useRef<any>(null);

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

  // ─── Derived: watched chain IDs (all except destination) ──────────
  const watchedChainIds = useMemo(
    () => SUPPORTED_CHAINS.filter((c) => c.id !== destChainId).map((c) => c.id),
    [destChainId],
  );

  // ═══════════════════════════════════════════════════════════════════
  //  Balance watcher — polls USDC balances on watched chains
  // ═══════════════════════════════════════════════════════════════════

  const {
    balances,
    pendingDeposit,
    lastChecked,
    clearDeposit,
    setBridging,
  } = useBalanceWatcher(
    embeddedWallet?.address as `0x${string}` | undefined,
    watchedChainIds,
    isListening,
  );

  // ═══════════════════════════════════════════════════════════════════
  //  Session restore (persisted session key + details + listening cfg)
  // ═══════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!embeddedWallet) return;
    const addr = embeddedWallet.address;

    // Restore session signer
    const savedKey = loadSessionKey(addr);
    if (savedKey && !sessionSignerRef.current) {
      const { sessionSigner } = createSessionSigner(savedKey);
      sessionSignerRef.current = sessionSigner;
      setSessionSignerAddress(sessionSigner.address);
    }

    // Restore session details
    const savedDetails = loadSessionDetails(addr);
    if (savedDetails && !sessionDetails) {
      setSessionDetails(savedDetails);
    }

    // Restore listening config → jump straight to listening mode
    const savedConfig = loadListeningConfig(addr);
    if (savedConfig && savedDetails && savedKey) {
      setDestChainId(savedConfig.destChainId);
      setDestConfirmed(true);
      setRecipientIsSelf(savedConfig.recipientIsSelf);
      setRecipientAddr(savedConfig.recipientAddr);
      setIsListening(true);
    }
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

  /** Step 3 — Sign EIP-7702 authorization */
  const handleSignAuthorization = async () => {
    if (!embeddedWallet) return;
    setAuthStatus("loading");
    setError(null);
    try {
      const auth = await signAuthorization(
        { contractAddress: NEXUS_SINGLETON, chainId: 0 },
        { address: embeddedWallet.address },
      );
      setAuthorization(auth as SignAuthorizationReturnType);
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
    if (!embeddedWallet || !authorization) return;
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
    if (!sessionMeeClientRef.current || !authorization) return;
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

      // Pass the 7702 authorization so the delegation is propagated
      // on-chain in the same supertransaction that installs the module.
      const installResult = await installSessionModule({
        sessionMeeClient: sessionMeeClientRef.current,
        smartSessionsValidator: ssModule,
        authorization,
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
        feeChainId: arbitrum.id,
      });
      setSessionDetails(details);
      if (embeddedWallet) {
        saveSessionDetails(embeddedWallet.address, details);
      }
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

    // 2. Clear persisted session details + listening config.
    //    The session key (signer private key) is kept so we
    //    don't have to re-install the sessions module.
    if (embeddedWallet) {
      clearSession(embeddedWallet.address, { keepKey: true });
    }

    // 3. Reset in-memory session details
    setSessionDetails(null);

    // 4. Reset the grant step so the pipeline re-runs it
    setGrantStatus("idle");

    // 5. Re-open destination selection so the user can change chain/recipient
    setDestConfirmed(false);

    // 6. Clear the session-signer MEE client so it's re-created fresh
    sessionSignerMeeClientRef.current = null;

    // 7. Reset bridge / transfer UI state
    setBridgeStatus("idle");
    setBridgingChainId(null);
    setTransfers([]);

    // 8. Clear any lingering error
    setError(null);
  }, [embeddedWallet]);

  // ═══════════════════════════════════════════════════════════════════
  //  Transition to listening mode after setup completes
  // ═══════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (grantStatus === "success" && sessionDetails && !isListening) {
      // Persist the listening configuration
      if (embeddedWallet) {
        saveListeningConfig(embeddedWallet.address, {
          destChainId,
          recipientIsSelf,
          recipientAddr,
        });
      }
      // Small delay so the user can see step 7 complete
      const timer = setTimeout(() => setIsListening(true), 800);
      return () => clearTimeout(timer);
    }
  }, [grantStatus, sessionDetails]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════════════
  //  Bridge handler — triggered by balance watcher detecting a deposit
  // ═══════════════════════════════════════════════════════════════════

  const handleBridgeDeposit = useCallback(
    async (deposit: DetectedDeposit) => {
      if (
        !sessionSignerRef.current ||
        !sessionDetails ||
        !embeddedWallet ||
        bridgeStatus === "loading"
      )
        return;

      setBridging(true);
      setBridgeStatus("loading");
      setBridgingChainId(deposit.chainId);
      setError(null);

      try {
        // Lazy-create the session-signer MEE client
        if (!sessionSignerMeeClientRef.current) {
          const { sessionMeeClient: ssClient } = await createSessionMeeClient(
            sessionSignerRef.current,
            embeddedWallet.address as `0x${string}`,
          );
          sessionSignerMeeClientRef.current = ssClient;
        }

        const result = await executeDepositV3({
          sessionMeeClient: sessionSignerMeeClientRef.current,
          sessionDetails,
          walletAddress: embeddedWallet.address as `0x${string}`,
          recipient:
            effectiveRecipient ||
            (embeddedWallet.address as `0x${string}`),
          sourceChainId: deposit.chainId,
          destinationChainId: destChainId,
          amount: deposit.amount,
          tokenSymbol: deposit.tokenSymbol,
        });

        setTransfers((prev) => [
          {
            sourceChainId: deposit.chainId,
            destinationChainId: destChainId,
            tokenSymbol: deposit.tokenSymbol,
            amount: deposit.amount,
            txHash: result.hash,
            timestamp: Date.now(),
          },
          ...prev,
        ]);

        setBridgeStatus("success");
        console.log("Supertransaction hash:", result.hash);
        console.log(
          "MeeScan:",
          `https://meescan.biconomy.io/details/${result.hash}`,
        );
      } catch (err) {
        console.error("Failed to bridge deposit:", err);
        setError(
          err instanceof Error ? err.message : "Failed to bridge deposit",
        );
        setBridgeStatus("error");
      } finally {
        setBridgingChainId(null);
        setBridging(false);
        clearDeposit();
        // Reset bridge status after a delay so UI can show result
        setTimeout(() => setBridgeStatus("idle"), 5000);
      }
    },
    [sessionDetails, embeddedWallet, destChainId, effectiveRecipient, bridgeStatus, setBridging, clearDeposit],
  );

  // ─── Auto-trigger bridge when deposit detected ─────────────────────
  useEffect(() => {
    if (pendingDeposit && isListening && bridgeStatus !== "loading") {
      handleBridgeDeposit(pendingDeposit);
    }
  }, [pendingDeposit, isListening]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════════════
  //  Auto-advance — each setup step triggers the next when it succeeds
  //  (Steps 3–7 only; no auto-execute bridge)
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
    if (setupStatus === "success" && authorization && installStatus === "idle")
      handleInstallSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupStatus, authorization, installStatus]);

  useEffect(() => {
    if (installStatus === "success" && grantStatus === "idle")
      handleGrantPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installStatus, grantStatus]);

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
  //  Step status derivation (7 setup steps)
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
    setupStatus === "success" && !!authorization,
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
    balances,
    watchedChainIds,
    bridgeStatus,
    bridgingChainId,
    transfers,
    lastChecked,

    // ── Reconfigure ─────────────────────────────────────────────────
    handleReconfigure,
  };
}

/** Convenience type for components that consume the pipeline state */
export type PipelineState = ReturnType<typeof usePipeline>;
