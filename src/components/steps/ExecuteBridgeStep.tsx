import type { Hash } from "viem";
import type { StepStatus, Status } from "../../types";
import { CHAIN_META } from "../../constants";
import { StepCard } from "../StepCard";
import { StepIndicator } from "../StepIndicator";

interface Props {
  status: StepStatus;
  execStatus: Status;
  txHash: Hash | null;
  destChainId: number;
  stepRef: (el: HTMLDivElement | null) => void;
}

export function ExecuteBridgeStep({
  status,
  execStatus,
  txHash,
  destChainId,
  stepRef,
}: Props) {
  return (
    <StepCard
      index={7}
      status={status}
      title="Execute Bridge"
      description={`Bridge 1 USDC from Arbitrum → ${CHAIN_META[destChainId].name} via Across. Fees paid in USDC on Arbitrum.`}
      stepRef={stepRef}
    >
      <StepIndicator
        status={execStatus}
        loadingLabel="Bridging USDC…"
        doneLabel="Bridged"
        hash={txHash}
      />
    </StepCard>
  );
}

