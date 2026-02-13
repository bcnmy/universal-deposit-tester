"use client";

import { Check, ExternalLink, Loader2 } from "lucide-react";
import type { Hash } from "viem";
import type { Status } from "../types";
import { shortAddr, meescanLink } from "../utils";

interface StepIndicatorProps {
  status: Status;
  loadingLabel: string;
  doneLabel: string;
  doneValue?: string;
  hash?: Hash | null;
}

/**
 * Shared indicator shown inside each automated step card.
 * Displays one of three states: waiting → loading → done.
 */
export function StepIndicator({
  status,
  loadingLabel,
  doneLabel,
  doneValue,
  hash,
}: StepIndicatorProps) {
  if (status === "success") {
    return (
      <div className="done-row">
        <span className="done-badge">
          <Check size={11} strokeWidth={3} />
          {doneLabel}
        </span>
        {doneValue && !hash && <span className="done-value">{doneValue}</span>}
        {hash && (
          <a
            href={meescanLink(hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="done-value done-value--link"
          >
            {shortAddr(hash)}
            <ExternalLink size={11} />
          </a>
        )}
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="step-running">
        <Loader2 size={14} className="icon-spin" />
        <span>{loadingLabel}</span>
      </div>
    );
  }

  return (
    <div className="step-waiting">
      <span>Waiting…</span>
    </div>
  );
}

