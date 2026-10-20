import type { ReactNode } from "react";
import type { EngineStatus } from "@/lib/api/schemas";
import { decisionMeta, STATUS_META, type Tone } from "@/lib/domain";
import { cn } from "@/lib/utils";

const toneClass: Record<Tone, string> = {
  warn: "bg-warn-soft text-warn",
  caution: "bg-caution-soft text-caution",
  normal: "bg-normal-soft text-normal",
  policy: "bg-policy-soft text-policy",
  neutral: "bg-sunken text-ink-2",
};

/** Shape differs per tone so status is legible without colour (square, triangle, circle). */
export function ToneMark({ tone, className }: { tone: Tone; className?: string }) {
  const common = cn("inline-block shrink-0", className);
  if (tone === "warn") return <svg aria-hidden="true" viewBox="0 0 10 10" className={cn("size-2.5", common)}><rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor" /></svg>;
  if (tone === "caution") return <svg aria-hidden="true" viewBox="0 0 10 10" className={cn("size-2.5", common)}><path d="M5 1 9.2 8.8H.8Z" fill="currentColor" /></svg>;
  if (tone === "normal") return <svg aria-hidden="true" viewBox="0 0 10 10" className={cn("size-2.5", common)}><circle cx="5" cy="5" r="4" fill="currentColor" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 10 10" className={cn("size-2.5", common)}><circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
}

export function Badge({ tone = "neutral", children, className, mark = true }: { tone?: Tone; children: ReactNode; className?: string; mark?: boolean }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-xs px-2 text-xs font-semibold", toneClass[tone], className)}>
      {mark && <ToneMark tone={tone} />}
      {children}
    </span>
  );
}

export function StatusBadge({ status, short = true, className }: { status: EngineStatus; short?: boolean; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone} className={className}>
      {short ? meta.short : meta.label}
    </Badge>
  );
}

export function DecisionBadge({ decision, className }: { decision: string; className?: string }) {
  const meta = decisionMeta(decision);
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

export function FleetTag({ subset, className }: { subset: string; className?: string }) {
  return (
    <span className={cn("ident inline-flex h-5 items-center rounded-xs border border-line-strong px-1.5 text-[0.7rem] text-ink-2", className)}>
      {subset}
    </span>
  );
}
