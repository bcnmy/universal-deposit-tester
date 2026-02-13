"use client";

import type { PipelineState } from "../hooks/usePipeline";
import { ConnectWalletStep } from "./steps/ConnectWalletStep";
import { SelectDestinationStep } from "./steps/SelectDestinationStep";
import { InitializingCard } from "./steps/InitializingCard";

interface PipelineProps {
  pipeline: PipelineState;
}

export function Pipeline({ pipeline: p }: PipelineProps) {
  const s = p.stepStatuses;
  const ref = (i: number) => (el: HTMLDivElement | null) => {
    p.stepRefs.current[i] = el;
  };

  // Show the initializing card once the destination has been confirmed
  const showInitializing = p.destConfirmed;

  return (
    <section className="pipeline-section">
      <div className="pipeline-viewport">
        <div className="pipeline">
          {/* Step 1 — Connect Wallet */}
          <ConnectWalletStep
            status={s[0]}
            authenticated={p.authenticated}
            walletAddress={p.embeddedWallet?.address}
            onLogin={p.login}
            stepRef={ref(0)}
          />

          {/* Step 2 — Select Destination */}
          <SelectDestinationStep
            status={s[1]}
            destChainId={p.destChainId}
            setDestChainId={p.setDestChainId}
            destConfirmed={p.destConfirmed}
            setDestConfirmed={p.setDestConfirmed}
            chainDropdownOpen={p.chainDropdownOpen}
            setChainDropdownOpen={p.setChainDropdownOpen}
            chainDropdownRef={p.chainDropdownRef}
            chainTriggerRef={p.chainTriggerRef}
            dropdownPos={p.dropdownPos}
            recipientAddr={p.recipientAddr}
            setRecipientAddr={p.setRecipientAddr}
            recipientIsSelf={p.recipientIsSelf}
            setRecipientIsSelf={p.setRecipientIsSelf}
            walletAddress={p.embeddedWallet?.address}
            stepRef={ref(1)}
          />

          {/* Steps 3–6 — Combined into a single initializing card */}
          {showInitializing && (
            <InitializingCard
              authStatus={p.authStatus}
              setupStatus={p.setupStatus}
              installStatus={p.installStatus}
              grantStatus={p.grantStatus}
              stepRef={ref(2)}
            />
          )}
        </div>
      </div>
    </section>
  );
}
