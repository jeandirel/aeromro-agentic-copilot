import { useMemo } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HistoryRow } from "@/lib/api/schemas";
import { sensorLabel } from "@/lib/domain";
import { decimal2, int } from "@/lib/format";

function SensorTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) {
  const p = active ? (payload?.[0]?.payload as { cycle: number; value: number } | undefined) : undefined;
  if (!p) return null;
  return (
    <div className="rounded-sm border border-line bg-surface px-2.5 py-1.5 text-xs shadow-pop">
      <span className="text-ink-2">Cycle </span>
      <span className="readout">{int(p.cycle)}</span>
      <span className="text-ink-2"> : </span>
      <span className="readout">{decimal2(p.value)}</span>
    </div>
  );
}

/** One condition-normalised sensor over the observed cycles (observed data, drawn in ink). */
export function SensorChart({ history, sensorKey, apiLabel }: { history: HistoryRow[]; sensorKey: string; apiLabel?: string }) {
  const data = useMemo(
    () => history.flatMap((h) => (typeof h[sensorKey] === "number" ? [{ cycle: h.cycle, value: h[sensorKey] as number }] : [])),
    [history, sensorKey],
  );
  const { code, name } = sensorLabel(sensorKey, apiLabel);
  const first = data[0]?.value;
  const last = data[data.length - 1]?.value;
  const delta = first !== undefined && last !== undefined ? last - first : null;

  return (
    <figure className="m-0 rounded-md border border-line bg-surface-2/60 p-3">
      <figcaption className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ident text-sm text-ink">{code}</p>
          <p className="truncate text-xs text-ink-2" title={apiLabel}>{name}</p>
        </div>
        <div className="text-right">
          <p className="readout text-sm text-ink">{decimal2(last)}</p>
          <p className="text-2xs text-ink-3" title="Variation entre le début et la fin de la fenêtre affichée">
            Δ <span className="readout">{delta === null ? "—" : `${delta >= 0 ? "+" : "−"}${decimal2(Math.abs(delta))}`}</span>
          </p>
        </div>
      </figcaption>
      {data.length > 1 ? (
        <div className="mt-2 h-20" role="img" aria-label={`${code}, ${name} : dernière valeur normalisée ${decimal2(last)}, variation ${delta === null ? "inconnue" : decimal2(delta)} sur la période.`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
              <XAxis dataKey="cycle" type="number" domain={["dataMin", "dataMax"]} hide />
              <YAxis domain={["auto", "auto"]} hide />
              <Line dataKey="value" stroke="var(--ink)" strokeWidth={1.5} dot={false} isAnimationActive={false} activeDot={{ r: 3, fill: "var(--ink)", stroke: "var(--surface)" }} />
              <Tooltip content={({ active, payload }) => <SensorTooltip active={active} payload={payload} />} cursor={{ stroke: "var(--ink-3)", strokeDasharray: "2 2" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-2 text-xs text-ink-3">Mesure absente de l’historique.</p>
      )}
    </figure>
  );
}
