import type { StepStatus, Status } from "../../types";
import { shortAddr } from "../../utils";
import { StepCard } from "../StepCard";
import { StepIndicator } from "../StepIndicator";

interface Props {
  status: StepStatus;
  setupStatus: Status;
  walletAddress?: string;
  stepRef: (el: HTMLDivElement | null) => void;
}

export function InitializeNexusStep({
  status,
  setupStatus,
  walletAddress,
  stepRef,
}: Props) {
  return (
    <StepCard
      index={3}
      status={status}
      title="Initialize Nexus"
      description="Create a multichain Nexus account across Optimism, Base, Polygon &amp; Arbitrum."
      stepRef={stepRef}
    >
      <StepIndicator
        status={setupStatus}
        loadingLabel="Initializing…"
        doneLabel="Ready"
        doneValue={walletAddress ? shortAddr(walletAddress) : undefined}
      />
    </StepCard>
  );
}

