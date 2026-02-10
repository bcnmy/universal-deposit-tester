import type { StepStatus, Status } from "../../types";
import { StepCard } from "../StepCard";
import { StepIndicator } from "../StepIndicator";

interface Props {
  status: StepStatus;
  grantStatus: Status;
  stepRef: (el: HTMLDivElement | null) => void;
}

export function GrantPermissionStep({ status, grantStatus, stepRef }: Props) {
  return (
    <StepCard
      index={6}
      status={status}
      title="Grant Permission"
      description={`Authorize the session signer to call depositV3 on Across SpokePool.`}
      stepRef={stepRef}
    >
      <StepIndicator
        status={grantStatus}
        loadingLabel="Granting permission…"
        doneLabel="Granted"
        doneValue="depositV3 on Across"
      />
    </StepCard>
  );
}

