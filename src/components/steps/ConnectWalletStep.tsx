import { Check, Wallet } from "lucide-react";
import type { StepStatus } from "../../types";
import { shortAddr } from "../../utils";
import { StepCard } from "../StepCard";

interface Props {
  status: StepStatus;
  authenticated: boolean;
  walletAddress?: string;
  onLogin: () => void;
  stepRef: (el: HTMLDivElement | null) => void;
}

export function ConnectWalletStep({
  status,
  authenticated,
  walletAddress,
  onLogin,
  stepRef,
}: Props) {
  return (
    <StepCard
      index={0}
      status={status}
      title="Connect Wallet"
      description="Authenticate via Privy to provision an embedded wallet."
      stepRef={stepRef}
    >
      {!authenticated ? (
        <button className="btn-primary" onClick={onLogin}>
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
            {walletAddress ? shortAddr(walletAddress) : "Waiting…"}
          </span>
        </div>
      )}
    </StepCard>
  );
}

