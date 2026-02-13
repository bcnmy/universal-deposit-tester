"use client";

import { AlertTriangle } from "lucide-react";

interface ErrorToastProps {
  error: string | null;
}

export function ErrorToast({ error }: ErrorToastProps) {
  if (!error) return null;

  return (
    <div className="error-toast">
      <span className="error-toast-icon">
        <AlertTriangle size={16} />
      </span>
      <div className="error-toast-body">
        <span className="error-toast-title">Error</span>
        <span className="error-toast-msg">{error}</span>
      </div>
    </div>
  );
}

