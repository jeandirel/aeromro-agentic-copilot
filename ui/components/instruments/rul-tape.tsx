import type { Thresholds } from "@/lib/api/schemas";
import { STATUS_META } from "@/lib/domain";
import { cycles, interval } from "@/lib/format";
import { clamp, cn } from "@/lib/utils";

/**
 * RUL tape: the signature instrument of the console, modelled on a primary-flight-display tape.
 * The coloured bands are the status thresholds returned by the API; the magenta mark and bar are
 * the model's point estimate and 80 % interval. Same instrument at three sizes, everywhere.
 */
interface RulTapeProps {
  rul: number;
  low: number;
  high: number;
  thresholds: Thresholds;
  max: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const zoneFill = {
  warn: "color-mix(in srgb, var(--warn) 26%, transparent)",
  caution: "color-mix(in srgb, var(--caution-fill) 30%, transparent)",
  normal: "color-mix(in srgb, var(--normal-fill) 18%, transparent)",
} as const;

export function rulAriaLabel(rul: number, low: number, high: number, t: Thresholds) {
  return `RUL estimé ${cycles(rul)} cycles, intervalle à 80 % de ${interval(low, high)} cycles. Seuils : inspection à ${t.inspect_now} cycles, planification à ${t.plan_inspection} cycles.`;
}

export function RulTape({ rul, low, high, thresholds, max, size = "sm", className }: RulTapeProps) {
  const pct = (v: number) => clamp(v / max, 0, 1) * 100;
  const zones = [
    { key: "warn", from: 0, to: thresholds.inspect_now, label: STATUS_META.inspect_now.short },
    { key: "caution", from: thresholds.inspect_now, to: thresholds.plan_inspection, label: STATUS_META.plan_inspection.short },
    { key: "normal", from: thresholds.plan_inspection, to: max, label: STATUS_META.healthy.short },
  ] as const;
  const beyond = rul > max;
  const track = size === "lg" ? "h-3.5" : size === "md" ? "h-2.5" : "h-1.5";
  const bar = size === "lg" ? "h-1" : "h-0.5";
  const needle = size === "lg" ? "h-7 w-[3px]" : size === "md" ? "h-5 w-[3px]" : "h-3.5 w-[3px]";
  const ticks = size === "sm" ? [] : [0, thresholds.inspect_now, thresholds.plan_inspection, ...(size === "lg" ? [100] : []), max].filter(
    (v, i, all) => v <= max && all.indexOf(v) === i,
  );

  return (
    <div
      role="img"
      aria-label={rulAriaLabel(rul, low, high, thresholds)}
      className={cn("relative w-full select-none", size === "lg" ? "pb-9 pt-12" : size === "md" ? "pb-5 pt-1" : "py-1", className)}
    >
      {size === "lg" && (
        <div className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-center" style={{ left: `${clamp(pct(rul), 6, 94)}%` }}>
          <span className="readout block text-2xl leading-none text-predicted">{cycles(rul)}</span>
          <span className="block text-2xs text-ink-3">cycles restants</span>
        </div>
      )}
      <div className="relative flex items-center">
        <div className={cn("relative w-full overflow-hidden rounded-[2px]", track)}>
          {zones.map((z) => (
            <span
              key={z.key}
              className="absolute inset-y-0"
              style={{ left: `${pct(z.from)}%`, width: `${pct(z.to) - pct(z.from)}%`, background: zoneFill[z.key] }}
            />
          ))}
          {[thresholds.inspect_now, thresholds.plan_inspection].map((t) => (
            <span key={t} className="absolute inset-y-0 w-px bg-ink-3/70" style={{ left: `${pct(t)}%` }} />
          ))}
        </div>
        {/* 80 % prediction interval */}
        <span
          className={cn("absolute top-1/2 -translate-y-1/2 rounded-full bg-predicted", bar)}
          style={{ left: `${pct(low)}%`, width: `${Math.max(pct(high) - pct(low), 0.6)}%` }}
        />
        {size !== "sm" && (
          <>
            <span className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-predicted" style={{ left: `${pct(low)}%` }} />
            <span className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-predicted" style={{ left: `${pct(high)}%` }} />
          </>
        )}
        {/* point estimate */}
        <span
          className={cn("absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[1px] bg-predicted shadow-[0_0_0_1.5px_var(--surface)]", needle)}
          style={{ left: `${pct(rul)}%` }}
        />
        {beyond && (
          <span className="readout absolute -right-1 top-1/2 -translate-y-1/2 translate-x-full pl-1 text-2xs text-predicted" aria-hidden="true">
            ›
          </span>
        )}
      </div>
      {ticks.length > 0 && (
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0">
          {ticks.map((t) => (
            <span
              key={t}
              className={cn("readout absolute -translate-x-1/2 text-ink-3", size === "lg" ? "bottom-4 text-xs" : "bottom-0 text-[0.65rem]")}
              style={{ left: `${pct(t)}%` }}
            >
              {t === max ? `${t}+` : t}
            </span>
          ))}
          {size === "lg" && (
            <div className="absolute inset-x-0 bottom-0 hidden h-4 sm:block">
              {zones.map((z) => (
                <span
                  key={z.key}
                  className="absolute truncate text-center text-2xs text-ink-3"
                  style={{ left: `${pct(z.from)}%`, width: `${pct(z.to) - pct(z.from)}%` }}
                >
                  {pct(z.to) - pct(z.from) > 9 ? z.label : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
