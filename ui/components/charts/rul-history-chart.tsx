import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HistoryRow, Thresholds } from "@/lib/api/schemas";
import { cycles, int, interval } from "@/lib/format";
import { niceMax } from "@/lib/utils";

interface Point {
  cycle: number;
  rul: number;
  band: [number, number];
  low: number;
  high: number;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) {
  const point = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
  if (!point) return null;
  return (
    <div className="rounded-sm border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="text-ink-2">
        Cycle observé <span className="readout text-ink">{int(point.cycle)}</span>
      </p>
      <p className="mt-1 text-ink-2">
        RUL estimé <span className="readout text-predicted">{cycles(point.rul)}</span>
      </p>
      <p className="text-ink-2">
        Intervalle 80 % <span className="readout text-predicted">{interval(point.low, point.high)}</span>
      </p>
    </div>
  );
}

/** RUL estimate over the observed cycles, with its 80 % interval and the status thresholds. */
export function RulHistoryChart({ history, thresholds }: { history: HistoryRow[]; thresholds: Thresholds }) {
  const data = useMemo<Point[]>(
    () => history.map((h) => ({ cycle: h.cycle, rul: h.rul, band: [h.rul_low, h.rul_high], low: h.rul_low, high: h.rul_high })),
    [history],
  );
  const yMax = niceMax(Math.max(thresholds.plan_inspection + 10, ...data.map((d) => d.high)));
  const first = data[0];
  const last = data[data.length - 1];
  const label = first && last
    ? `Évolution du RUL estimé du cycle ${first.cycle} au cycle ${last.cycle} : de ${cycles(first.rul)} à ${cycles(last.rul)} cycles restants.`
    : "Aucun historique.";

  return (
    <figure className="m-0">
      <div className="h-64 w-full sm:h-72" role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="cycle"
              type="number"
              domain={["dataMin", "dataMax"]}
              tick={{ fill: "var(--ink-3)", fontSize: 11, fontFamily: "var(--font-instrument)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--line-strong)" }}
              allowDecimals={false}
            />
            <YAxis
              domain={[0, yMax]}
              ticks={Array.from({ length: yMax / 25 + 1 }, (_, i) => i * 25)}
              tick={{ fill: "var(--ink-3)", fontSize: 11, fontFamily: "var(--font-instrument)" }}
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
            />
            <ReferenceLine y={thresholds.inspect_now} stroke="var(--warn)" strokeDasharray="4 3" ifOverflow="extendDomain" />
            <ReferenceLine y={thresholds.plan_inspection} stroke="var(--caution)" strokeDasharray="4 3" ifOverflow="extendDomain" />
            <Area dataKey="band" stroke="none" fill="var(--predicted)" fillOpacity={0.14} isAnimationActive={false} activeDot={false} />
            <Line dataKey="rul" stroke="var(--predicted)" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, fill: "var(--predicted)", stroke: "var(--surface)", strokeWidth: 2 }} />
            <Tooltip content={({ active, payload }) => <ChartTooltip active={active} payload={payload} />} cursor={{ stroke: "var(--ink-3)", strokeDasharray: "2 2" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-4 bg-predicted" />RUL estimé</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-4 bg-predicted/20" />Intervalle à 80 %</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-4 border-t border-dashed border-warn" />Seuil d’inspection ({thresholds.inspect_now})</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-4 border-t border-dashed border-caution" />Seuil de planification ({thresholds.plan_inspection})</span>
        <span className="text-ink-3">Axe horizontal : cycles observés</span>
      </figcaption>
    </figure>
  );
}
