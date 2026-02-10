import type { StepStatus, Status } from "../../types";
import { StepCard } from "../StepCard";
import { StepIndicator } from "../StepIndicator";

interface Props {
  status: StepStatus;
  authStatus: Status;
  stepRef: (el: HTMLDivElement | null) => void;
}

export function SignAuthorizationStep({ status, authStatus, stepRef }: Props) {
  return (
    <StepCard
      index={2}
      status={status}
      title="Sign EIP-7702"
      description="Delegate Nexus smart account logic to your EOA with a universal authorization."
      stepRef={stepRef}
    >
      <StepIndicator
        status={authStatus}
        loadingLabel="Signing authorization…"
        doneLabel="Authorized"
        doneValue="EIP-7702 signed"
      />
    </StepCard>
  );
}

