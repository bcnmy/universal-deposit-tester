import type { Hash } from "viem";
import type { StepStatus, Status } from "../../types";
import { shortAddr } from "../../utils";
import { StepCard } from "../StepCard";
import { StepIndicator } from "../StepIndicator";

interface Props {
  status: StepStatus;
  installStatus: Status;
  installTxHash: Hash | null;
  sessionSignerAddress: string | null;
  stepRef: (el: HTMLDivElement | null) => void;
}

export function InstallSessionsStep({
  status,
  installStatus,
  installTxHash,
  sessionSignerAddress,
  stepRef,
}: Props) {
  return (
    <StepCard
      index={4}
      status={status}
      title="Deploy & Install Sessions"
      description="Activate the EIP-7702 delegation and install the Smart Sessions module in a single transaction."
      stepRef={stepRef}
    >
      <StepIndicator
        status={installStatus}
        loadingLabel="Deploying & installing module…"
        doneLabel="Deployed & installed"
        doneValue={
          sessionSignerAddress ? shortAddr(sessionSignerAddress) : undefined
        }
        hash={installTxHash}
      />
    </StepCard>
  );
}

