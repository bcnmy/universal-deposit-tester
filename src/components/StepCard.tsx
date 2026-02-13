"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import type { StepStatus } from "../types";
import { STEP_THEMES } from "../constants";

interface StepCardProps {
  /** Zero-based step index (0–5) */
  index: number;
  status: StepStatus;
  title: string;
  description: string;
  children: ReactNode;
  /** Extra className on the card div (e.g. "step-card--receipt") */
  cardClassName?: string;
  /** Ref callback for auto-scroll */
  stepRef?: (el: HTMLDivElement | null) => void;
}

export function StepCard({
  index,
  status,
  title,
  description,
  children,
  cardClassName,
  stepRef,
}: StepCardProps) {
  const theme = STEP_THEMES[index];
  const Icon = theme.icon;
  const stepNum = String(index + 1);

  return (
    <div className="step" data-status={status} ref={stepRef}>
      {/* Marker */}
      <div className="step-marker">
        <div className="step-num">
          {status === "completed" ? (
            <Check size={14} strokeWidth={3} />
          ) : (
            stepNum
          )}
        </div>
      </div>

      {/* Card */}
      <div className={`step-card${cardClassName ? ` ${cardClassName}` : ""}`}>
        <div className="card-header">
          <span
            className="card-icon"
            style={{ backgroundColor: theme.bg, color: theme.fg }}
          >
            <Icon size={15} />
          </span>
          <h3 className="card-title">{title}</h3>
        </div>
        <p className="card-desc">{description}</p>
        <div className="card-action">{children}</div>
      </div>
    </div>
  );
}

