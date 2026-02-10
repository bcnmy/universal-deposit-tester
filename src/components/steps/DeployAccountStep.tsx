import type { Hash } from "viem";
import type { StepStatus, Status } from "../../types";
import { SUPPORTED_CHAINS } from "../../config";
import { StepCard } from "../StepCard";
import { StepIndicator } from "../StepIndicator";

interface Props {
  status: StepStatus;
  deployStatus: Status;
  deployTxHash: Hash | null;
  stepRef: (el: HTMLDivElement | null) => void;
}

export function DeployAccountStep({
  status,
  deployStatus,
  deployTxHash,
  stepRef,
}: Props) {
  return (
    <StepCard
      index={4}
      status={status}
      title="Deploy Account"
      description="Broadcast the EIP-7702 delegation on all supported chains."
      stepRef={stepRef}
    >
      <StepIndicator
        status={deployStatus}
        loadingLabel="Deploying on all chains…"
        doneLabel="Deployed"
        doneValue={`${SUPPORTED_CHAINS.length} chains active`}
        hash={deployTxHash}
      />
    </StepCard>
  );
}

