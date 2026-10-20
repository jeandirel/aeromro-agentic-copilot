import { AlertTriangle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { ApiError, errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function ErrorState({
  error,
  title = "Données indisponibles",
  onRetry,
  className,
  compact = false,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const api = error instanceof ApiError ? error : null;
  return (
    <div role="alert" className={cn("flex gap-3 rounded-md border border-warn/35 bg-warn-soft/60 text-ink", compact ? "p-3" : "p-4", className)}>
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-ink-2">{errorMessage(error)}</p>
        {(api?.status || api?.detail) && (
          <p className="readout mt-1 break-words text-xs text-ink-3">
            {api.status ? `HTTP ${api.status}` : ""}
            {api.status && api.detail ? " — " : ""}
            {api.detail ?? ""}
          </p>
        )}
        {onRetry && (
          <Button size="sm" variant="secondary" className="mt-3" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            Réessayer
          </Button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action, className }: { title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-2 rounded-md border border-dashed border-line-strong p-5", className)}>
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="max-w-[60ch] text-sm text-ink-2">{children}</div>}
      {action}
    </div>
  );
}
