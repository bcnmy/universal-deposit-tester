import { useState, useRef, useEffect } from "react";
import {
  usePrivy,
  useWallets,
  useSign7702Authorization,
} from "@privy-io/react-auth";
import { parseUnits, type Hash } from "viem";
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
  deployAccount,
  installSessionModule,
  grantDepositV3Permission,
  executeDepositV3,
  saveSessionKey,
  loadSessionKey,
  saveSessionDetails,
  loadSessionDetails,
  type SessionDetails,
} from "../sessions/index";
import { NEXUS_SINGLETON, SUPPORTED_CHAINS } from "../config";
import { isValidAddress, deriveStatus } from "../utils";
import type { Status, StepStatus } from "../types";

// ─────────────────────────────────────────────────────────────────────
//  usePipeline — all pipeline state, handlers, auto-advance effects,
//  and derived step statuses in one hook.
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
  const [deployStatus, setDeployStatus] = useState<Status>("idle");
  const [installStatus, setInstallStatus] = useState<Status>("idle");
  const [grantStatus, setGrantStatus] = useState<Status>("idle");
  const [execStatus, setExecStatus] = useState<Status>("idle");
  const [deployTxHash, setDeployTxHash] = useState<Hash | null>(null);
  const [installTxHash, setInstallTxHash] = useState<Hash | null>(null);
  const [txHash, setTxHash] = useState<Hash | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  // ═══════════════════════════════════════════════════════════════════
  //  Session restore (persisted session key + details)
  // ═══════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!embeddedWallet) return;
    const addr = embeddedWallet.address;

    const savedKey = loadSessionKey(addr);
    if (savedKey && !sessionSignerRef.current) {
      const { sessionSigner } = createSessionSigner(savedKey);
      sessionSignerRef.current = sessionSigner;
      setSessionSignerAddress(sessionSigner.address);
    }

    const savedDetails = loadSessionDetails(addr);
    if (savedDetails && !sessionDetails) {
      setSessionDetails(savedDetails);
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
  //  Step handlers
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

  /** Step 5 — Deploy account on all chains */
  const handleDeployAccount = async () => {
    if (!meeClientRef.current || !embeddedWallet || !authorization) return;
    setDeployStatus("loading");
    setError(null);
    try {
      const deployResult = await deployAccount({
        meeClient: meeClientRef.current,
        walletAddress: embeddedWallet.address as `0x${string}`,
        authorization,
      });
      setDeployTxHash(deployResult.hash);
      setDeployStatus("success");
    } catch (err) {
      console.error("Failed to deploy account:", err);
      setError(
        err instanceof Error ? err.message : "Failed to deploy account",
      );
      setDeployStatus("error");
    }
  };

  /** Step 6 — Install Smart Sessions module */
  const handleInstallSessions = async () => {
    if (!sessionMeeClientRef.current) return;
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

  /** Step 8 — Execute depositV3 via session key */
  const handleExecuteDeposit = async () => {
    if (!sessionSignerRef.current || !sessionDetails || !embeddedWallet) return;
    setExecStatus("loading");
    setError(null);
    try {
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
        sourceChainId: arbitrum.id,
        destinationChainId: destChainId,
        amount: parseUnits("1", 6),
      });

      setTxHash(result.hash);
      setExecStatus("success");
      console.log("Supertransaction hash:", result.hash);
      console.log(
        "MeeScan:",
        `https://meescan.biconomy.io/details/${result.hash}`,
      );
    } catch (err) {
      console.error("Failed to execute depositV3:", err);
      setError(
        err instanceof Error ? err.message : "Failed to execute depositV3",
      );
      setExecStatus("error");
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  //  Auto-advance — each step triggers the next when it succeeds
  // ═══════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (destConfirmed && embeddedWallet && authStatus === "idle")
      handleSignAuthorization();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destConfirmed, embeddedWallet, authStatus]);

  useEffect(() => {
    if (authStatus === "success" && setupStatus === "idle") handleSetupNexus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, setupStatus]);

  useEffect(() => {
    if (setupStatus === "success" && authorization && deployStatus === "idle")
      handleDeployAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupStatus, authorization, deployStatus]);

  useEffect(() => {
    if (deployStatus === "success" && installStatus === "idle")
      handleInstallSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployStatus, installStatus]);

  useEffect(() => {
    if (installStatus === "success" && grantStatus === "idle")
      handleGrantPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installStatus, grantStatus]);

  useEffect(() => {
    if (grantStatus === "success" && sessionDetails && execStatus === "idle")
      handleExecuteDeposit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantStatus, sessionDetails, execStatus]);

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
  //  Step status derivation (9 steps)
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
    deployStatus,
  );
  const s6 = deriveStatus(deployStatus === "success", installStatus);
  const s7 = deriveStatus(installStatus === "success", grantStatus);
  const s8 = deriveStatus(
    grantStatus === "success" && !!sessionDetails,
    execStatus,
  );
  const s9: StepStatus = txHash
    ? "completed"
    : execStatus === "success"
      ? "active"
      : "pending";

  const stepStatuses: StepStatus[] = [s1, s2, s3, s4, s5, s6, s7, s8, s9];

  const activeIdx = stepStatuses.findIndex(
    (s) => s === "active" || s === "error",
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
    deployStatus,
    installStatus,
    grantStatus,
    execStatus,

    // Transaction hashes
    deployTxHash,
    installTxHash,
    txHash,

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
  };
}

/** Convenience type for components that consume the pipeline state */
export type PipelineState = ReturnType<typeof usePipeline>;

