import type { PipelineState } from "../hooks/usePipeline";
import { ConnectWalletStep } from "./steps/ConnectWalletStep";
import { SelectDestinationStep } from "./steps/SelectDestinationStep";
import { SignAuthorizationStep } from "./steps/SignAuthorizationStep";
import { InitializeNexusStep } from "./steps/InitializeNexusStep";
import { DeployAccountStep } from "./steps/DeployAccountStep";
import { InstallSessionsStep } from "./steps/InstallSessionsStep";
import { GrantPermissionStep } from "./steps/GrantPermissionStep";
import { ExecuteBridgeStep } from "./steps/ExecuteBridgeStep";
import { ReceiptStep } from "./steps/ReceiptStep";

interface PipelineProps {
  pipeline: PipelineState;
}

export function Pipeline({ pipeline: p }: PipelineProps) {
  const s = p.stepStatuses;
  const ref = (i: number) => (el: HTMLDivElement | null) => {
    p.stepRefs.current[i] = el;
  };

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
            stepRef={ref(1)}
          />

          {/* Step 3 — Sign EIP-7702 */}
          <SignAuthorizationStep
            status={s[2]}
            authStatus={p.authStatus}
            stepRef={ref(2)}
          />

          {/* Step 4 — Initialize Nexus */}
          <InitializeNexusStep
            status={s[3]}
            setupStatus={p.setupStatus}
            walletAddress={p.embeddedWallet?.address}
            stepRef={ref(3)}
          />

          {/* Step 5 — Deploy Account */}
          <DeployAccountStep
            status={s[4]}
            deployStatus={p.deployStatus}
            deployTxHash={p.deployTxHash}
            stepRef={ref(4)}
          />

          {/* Step 6 — Install Sessions */}
          <InstallSessionsStep
            status={s[5]}
            installStatus={p.installStatus}
            installTxHash={p.installTxHash}
            sessionSignerAddress={p.sessionSignerAddress}
            stepRef={ref(5)}
          />

          {/* Step 7 — Grant Permission */}
          <GrantPermissionStep
            status={s[6]}
            grantStatus={p.grantStatus}
            stepRef={ref(6)}
          />

          {/* Step 8 — Execute Bridge */}
          <ExecuteBridgeStep
            status={s[7]}
            execStatus={p.execStatus}
            txHash={p.txHash}
            destChainId={p.destChainId}
            stepRef={ref(7)}
          />

          {/* Step 9 — Receipt */}
          <ReceiptStep
            status={s[8]}
            txHash={p.txHash}
            destChainId={p.destChainId}
            walletAddress={p.embeddedWallet?.address || ""}
            recipientIsSelf={p.recipientIsSelf}
            recipientAddr={p.recipientAddr}
            sessionSignerAddress={p.sessionSignerAddress}
            stepRef={ref(8)}
          />
        </div>
      </div>
    </section>
  );
}

