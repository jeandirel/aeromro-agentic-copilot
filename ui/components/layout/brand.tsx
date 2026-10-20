import { cn } from "@/lib/utils";

/** Fan-face mark: five swept blades inside a nacelle ring. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <rect width="32" height="32" rx="8" fill="var(--ink)" />
      <g transform="translate(16 16)" fill="var(--policy)">
        {[0, 72, 144, 216, 288].map((r) => (
          <path key={r} transform={`rotate(${r})`} d="M-1.2-3.2C0.3-6.6 2.6-9.3 5.6-10.6L7.2-8.9C4.6-7.6 2.6-5.1 1.6-2Z" />
        ))}
        <circle r="2.4" fill="var(--canvas)" />
      </g>
      <circle cx="16" cy="16" r="12.2" fill="none" stroke="var(--canvas)" strokeWidth="1.8" />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark />
      <span className="leading-none">
        <span className="block text-[1.05rem] font-semibold tracking-[-0.01em] text-ink [font-stretch:112%]">AeroMRO</span>
        {!compact && <span className="mt-1 block text-2xs text-ink-3">Santé moteur et maintenance</span>}
      </span>
    </span>
  );
}
