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
      index={5}
      status={status}
      title="Install Sessions"
      description="Generate a session signer and install the Smart Sessions module."
      stepRef={stepRef}
    >
      <StepIndicator
        status={installStatus}
        loadingLabel="Installing module…"
        doneLabel="Installed"
        doneValue={
          sessionSignerAddress ? shortAddr(sessionSignerAddress) : undefined
        }
        hash={installTxHash}
      />
    </StepCard>
  );
}

