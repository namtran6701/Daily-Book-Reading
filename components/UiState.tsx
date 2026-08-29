import type { ReactNode } from "react";

type Action = {
  label: string;
  onClick: () => void;
};

export function StatusBanner({
  tone,
  icon,
  title,
  children,
  action,
}: {
  tone: "offline" | "error";
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: Action;
}) {
  return (
    <div className={`status-banner status-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span className="status-glyph" aria-hidden="true">
        {icon}
      </span>
      <span className="status-copy">
        <strong>{title}</strong>
        <span>{children}</span>
      </span>
      {action && (
        <button className="status-action pressable" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

export function QuietState({
  icon,
  title,
  children,
  compact = false,
  action,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  compact?: boolean;
  action?: Action;
  className?: string;
}) {
  return (
    <div className={`quiet-state ${compact ? "quiet-state-compact" : ""} ${className}`.trim()}>
      <span className="quiet-state-glyph" aria-hidden="true">
        {icon}
      </span>
      <div className="quiet-state-copy">
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
      {action && (
        <button className="text-button pressable" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/animated.svg" alt="" aria-hidden="true" />
      <h2>Opening your second brain</h2>
      <span className="loading-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <p>Gathering your thoughts, notes, and reading.</p>
    </div>
  );
}
