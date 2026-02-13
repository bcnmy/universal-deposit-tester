"use client";

import { Loader2, Check, Shield } from "lucide-react";
import type { Status } from "../../types";

interface Props {
  authStatus: Status;
  setupStatus: Status;
  installStatus: Status;
  grantStatus: Status;
  stepRef: (el: HTMLDivElement | null) => void;
}

/** Normie-friendly labels for each sub-step */
const SUB_STEPS: {
  key: keyof Pick<Props, "authStatus" | "setupStatus" | "installStatus" | "grantStatus">;
  loadingLabel: string;
  doneLabel: string;
}[] = [
  { key: "authStatus", loadingLabel: "Securing your account…", doneLabel: "Account secured" },
  { key: "setupStatus", loadingLabel: "Setting up your deposit address…", doneLabel: "Address ready" },
  { key: "installStatus", loadingLabel: "Enabling automatic transfers…", doneLabel: "Transfers enabled" },
  { key: "grantStatus", loadingLabel: "Finalizing permissions…", doneLabel: "Permissions set" },
];

export function InitializingCard({
  authStatus,
  setupStatus,
  installStatus,
  grantStatus,
  stepRef,
}: Props) {
  const statuses: Record<string, Status> = { authStatus, setupStatus, installStatus, grantStatus };

  // Count completed sub-steps
  const completedCount = SUB_STEPS.filter((s) => statuses[s.key] === "success").length;
  const allDone = completedCount === SUB_STEPS.length;
  const hasError = SUB_STEPS.some((s) => statuses[s.key] === "error");
  const progress = (completedCount / SUB_STEPS.length) * 100;

  // Find the currently active sub-step
  const activeStep = SUB_STEPS.find((s) => statuses[s.key] === "loading");

  return (
    <div className="step" data-status="active" ref={stepRef}>
      {/* Marker */}
      <div className="step-marker">
        <div className="step-num">
          {allDone ? <Check size={14} strokeWidth={3} /> : "3"}
        </div>
      </div>

      {/* Card */}
      <div className={`step-card init-card${allDone ? " init-card--done" : ""}${hasError ? " init-card--error" : ""}`}>
        <div className="init-card-header">
          <div className={`init-card-icon${allDone ? " init-card-icon--done" : ""}`}>
            {allDone ? (
              <Check size={20} strokeWidth={2.5} />
            ) : (
              <Shield size={20} />
            )}
          </div>
          <div>
            <h3 className="init-card-title">
              {allDone ? "Deposit Address Ready" : "Initializing Universal Deposit Address"}
            </h3>
            <p className="init-card-sub">
              {allDone
                ? "Your address is set up and ready to receive funds on any chain."
                : "Setting everything up so you can receive funds on any supported chain."}
            </p>
          </div>
        </div>

        {/* Status text */}
        <div className="init-card-status">
          {allDone ? (
            <div className="init-status-row init-status-row--done">
              <Check size={13} strokeWidth={3} />
              <span>All set — you're ready to go!</span>
            </div>
          ) : activeStep ? (
            <div className="init-status-row init-status-row--loading">
              <Loader2 size={14} className="icon-spin" />
              <span>{activeStep.loadingLabel}</span>
            </div>
          ) : hasError ? (
            <div className="init-status-row init-status-row--error">
              <span>Something went wrong. Retrying…</span>
            </div>
          ) : (
            <div className="init-status-row init-status-row--waiting">
              <Loader2 size={14} className="icon-spin" />
              <span>Preparing…</span>
            </div>
          )}
        </div>

        {/* Completed sub-step pills */}
        {completedCount > 0 && !allDone && (
          <div className="init-card-pills">
            {SUB_STEPS.filter((s) => statuses[s.key] === "success").map((s) => (
              <span key={s.key} className="init-pill">
                <Check size={10} strokeWidth={3} />
                {s.doneLabel}
              </span>
            ))}
          </div>
        )}

        {/* Progress bar */}
        <div className="init-progress-track">
          <div
            className={`init-progress-fill${allDone ? " init-progress-fill--done" : ""}${hasError ? " init-progress-fill--error" : ""}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

