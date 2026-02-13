"use client";

import type { Hash } from "viem";
import { CircleCheck, ExternalLink, Loader2 } from "lucide-react";
import type { StepStatus } from "../../types";
import { shortAddr, meescanLink } from "../../utils";
import { CHAIN_META } from "../../constants";
import { StepCard } from "../StepCard";

interface Props {
  status: StepStatus;
  txHash: Hash | null;
  destChainId: number;
  walletAddress: string;
  recipientIsSelf: boolean;
  recipientAddr: string;
  sessionSignerAddress: string | null;
  stepRef: (el: HTMLDivElement | null) => void;
}

export function ReceiptStep({
  status,
  txHash,
  destChainId,
  walletAddress,
  recipientIsSelf,
  recipientAddr,
  sessionSignerAddress,
  stepRef,
}: Props) {
  return (
    <StepCard
      index={8}
      status={status}
      title="Receipt"
      description=""
      cardClassName="step-card--receipt"
      stepRef={stepRef}
    >
      {txHash ? (
        <div className="receipt">
          <div className="receipt-icon">
            <CircleCheck size={22} />
          </div>
          <p className="receipt-headline">Transfer Confirmed</p>

          <div className="receipt-grid">
            <ReceiptRow label="Route" value={`Arbitrum → ${CHAIN_META[destChainId].name}`} />
            <ReceiptRow label="Amount" value="1 USDC" highlight />
            <ReceiptRow label="Wallet" value={shortAddr(walletAddress)} mono />
            <ReceiptRow
              label="Recipient"
              value={recipientIsSelf ? shortAddr(walletAddress) : shortAddr(recipientAddr)}
              mono
            />
            <ReceiptRow
              label="Session"
              value={shortAddr(sessionSignerAddress || "")}
              mono
            />
            <div className="receipt-row">
              <span className="receipt-label">Tx Hash</span>
              <a
                href={meescanLink(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="receipt-val receipt-val--mono receipt-val--link"
              >
                {shortAddr(txHash)}
                <ExternalLink size={11} />
              </a>
            </div>
          </div>

          <div className="receipt-footer">
            Fees paid in USDC on Arbitrum · Session key executed
          </div>
        </div>
      ) : (
        <div className="receipt-waiting">
          <Loader2 size={14} />
          Awaiting execution…
        </div>
      )}
    </StepCard>
  );
}

/* ── Helper ─────────────────────────────────────────────────────── */

function ReceiptRow({
  label,
  value,
  highlight,
  mono,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
}) {
  const cls = [
    "receipt-val",
    highlight && "receipt-val--highlight",
    mono && "receipt-val--mono",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="receipt-row">
      <span className="receipt-label">{label}</span>
      <span className={cls}>{value}</span>
    </div>
  );
}

