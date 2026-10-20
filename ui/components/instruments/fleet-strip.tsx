import { useMemo, useState, type PointerEvent } from "react";
import { Link, useNavigate } from "react-router";
import type { Engine, EnginesResponse, FleetSummary } from "@/lib/api/schemas";
import { conditionsLabel, faultModes, STATUS_META } from "@/lib/domain";
import { cycles, int, interval, unitLabel } from "@/lib/format";
import { useElementWidth } from "@/lib/hooks";
import { clamp, cn, hash01 } from "@/lib/utils";
import { ToneMark } from "@/components/ui/badge";

/**
 * Fleet RUL map: every in-service engine of the four fleets placed on one shared RUL axis, over the
 * status bands. It answers "where does each fleet stand against the thresholds?" at a glance;
 * clicking an engine opens its diagnosis.
 */
const ROW_H = 64;
const LABEL_W = 176;
const COUNTS_W = 132;
const AXIS_H = 28;
const TOP = 22;

const DOT_COLOR = {
  inspect_now: "var(--warn)",
  plan_inspection: "var(--caution-fill)",
  healthy: "var(--normal-fill)",
} as const;

interface Hover {
  engine: Engine;
  x: number;
  y: number;
}

export function FleetStrip({ fleets, lists, max }: { fleets: FleetSummary[]; lists: EnginesResponse[]; max: number }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<Hover | null>(null);
  const navigate = useNavigate();
  const narrow = width > 0 && width < 720;
  const labelW = narrow ? 8 : LABEL_W;
  const countsW = narrow ? 18 : COUNTS_W;
  const plotW = Math.max(width - labelW - countsW, 120);
  const bandTop = narrow ? 28 : 4; // in narrow mode the row label sits above its own band
  const rowH = narrow ? ROW_H + 30 : ROW_H;
  const thresholds = lists[0]?.thresholds ?? { inspect_now: 15, plan_inspection: 50 };
  const x = (v: number) => labelW + clamp(v / max, 0, 1) * plotW;
  const height = TOP + lists.length * rowH + AXIS_H;

  const points = useMemo(
    () =>
      lists.map((list, row) =>
        list.engines.map((e) => {
          const band = rowH - (narrow ? 44 : 22);
          const yOffset = (narrow ? 34 : 12) + hash01(`${e.subset}-${e.unit}`) * band;
          return { e, cx: x(e.rul), cy: TOP + row * rowH + yOffset };
        }),
      ),
    // x depends on width/max; recompute when they change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lists, width, max, narrow],
  );

  const ticks = [0, 25, 50, 75, 100, 125, 150, 175, 200, 250, 300].filter((t) => t <= max && (plotW > 520 || t % 50 === 0));

  function onMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const row = Math.floor((py - TOP) / rowH);
    const candidates = points[row];
    if (!candidates) return setHover(null);
    let best: (typeof candidates)[number] | null = null;
    let bestD = 14 * 14;
    for (const p of candidates) {
      const d = (p.cx - px) ** 2 + (p.cy - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    setHover(best ? { engine: best.e, x: best.cx, y: best.cy } : null);
  }

  const summary = fleets
    .map((f) => `${f.subset} : ${f.status_counts.inspect_now} à inspecter, ${f.status_counts.plan_inspection} à planifier, ${f.status_counts.healthy} nominaux`)
    .join(". ");

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Carte de durée de vie résiduelle de ${int(points.flat().length)} moteurs. ${summary}.`}
          className="block touch-manipulation"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onClick={() => hover && navigate(`/engines/${hover.engine.subset}/${hover.engine.unit}`)}
          style={{ cursor: hover ? "pointer" : "default" }}
        >
          {/* status bands and thresholds, drawn per row */}
          {lists.map((list, row) => {
            const y = TOP + row * rowH + bandTop;
            const h = rowH - bandTop - (narrow ? 2 : 4);
            return (
              <g key={`bands-${list.subset}`}>
                <rect x={x(0)} y={y} width={x(thresholds.inspect_now) - x(0)} height={h} fill="color-mix(in srgb, var(--warn) 9%, transparent)" />
                <rect x={x(thresholds.inspect_now)} y={y} width={x(thresholds.plan_inspection) - x(thresholds.inspect_now)} height={h} fill="color-mix(in srgb, var(--caution-fill) 11%, transparent)" />
                {[thresholds.inspect_now, thresholds.plan_inspection].map((t, i) => (
                  <line key={t} x1={x(t)} x2={x(t)} y1={y} y2={y + h} stroke={i === 0 ? "var(--warn)" : "var(--caution)"} strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
                ))}
              </g>
            );
          })}
          {[thresholds.inspect_now, thresholds.plan_inspection].map((t, i) => (
            <text key={t} x={x(t) + 4} y={TOP - 7} className="readout" fontSize={10.5} fill={i === 0 ? "var(--warn)" : "var(--caution)"}>
              {t}
            </text>
          ))}
          {/* rows */}
          {lists.map((list, row) => {
            const y0 = TOP + row * rowH;
            const fleet = fleets.find((f) => f.subset === list.subset);
            return (
              <g key={list.subset}>
                {row > 0 && <line x1={0} x2={width} y1={y0} y2={y0} stroke="var(--line)" />}
                {narrow ? (
                  <text x={labelW} y={y0 + 18} fontSize={12.5} fontWeight={600} fill="var(--ink)">
                    {list.subset}
                    {fleet && (
                      <>
                        <tspan fontWeight={500} fill="var(--warn)" dx={10}>■ {fleet.status_counts.inspect_now}</tspan>
                        <tspan fontWeight={500} fill="var(--caution)" dx={8}>▲ {fleet.status_counts.plan_inspection}</tspan>
                        <tspan fontWeight={500} fill="var(--normal)" dx={8}>● {fleet.status_counts.healthy}</tspan>
                      </>
                    )}
                  </text>
                ) : (
                  <>
                    <text x={0} y={y0 + 22} fontSize={14} fontWeight={600} fill="var(--ink)" className="ident">
                      {list.subset}
                    </text>
                    {fleet && (
                      <text x={0} y={y0 + 39} fontSize={11.5} fill="var(--ink-3)">
                        <tspan x={0}>{conditionsLabel(fleet.conditions)}</tspan>
                        <tspan x={0} dy={14}>{faultModes(fleet.fault_modes)}</tspan>
                      </text>
                    )}
                  </>
                )}
                {points[row]?.map((p) => (
                  <circle key={p.e.unit} cx={p.cx} cy={p.cy} r={p.e.status === "healthy" ? 2.6 : 3.2} fill={DOT_COLOR[p.e.status]} opacity={p.e.status === "healthy" ? 0.72 : 0.95} />
                ))}
              </g>
            );
          })}
          {/* axis */}
          <g transform={`translate(0 ${TOP + lists.length * rowH})`}>
            <line x1={labelW} x2={labelW + plotW} y1={0} y2={0} stroke="var(--line-strong)" />
            {ticks.map((t) => (
              <g key={t} transform={`translate(${x(t)} 0)`}>
                <line y1={0} y2={4} stroke="var(--line-strong)" />
                <text y={17} textAnchor="middle" fontSize={10.5} fill="var(--ink-3)" className="readout">
                  {t === max ? `${t}+` : t}
                </text>
              </g>
            ))}
          </g>
          {hover && <circle cx={hover.x} cy={hover.y} r={6.5} fill="none" stroke="var(--ink)" strokeWidth={1.5} />}
        </svg>
      )}
      {!narrow && width > 0 && (
        <ul aria-label="Moteurs par statut et par flotte" className="pointer-events-none absolute right-0 top-0" style={{ width: countsW, paddingTop: TOP }}>
          {fleets.map((f) => (
            <li key={f.subset} className="pointer-events-auto flex items-center justify-end gap-3" style={{ height: rowH }}>
              {(["inspect_now", "plan_inspection", "healthy"] as const).map((s) => (
                <Link
                  key={s}
                  to={`/engines?fleet=${f.subset}&status=${s}`}
                  className={cn(
                    "readout inline-flex items-center gap-1 rounded-xs px-1 text-sm hover:bg-sunken",
                    s === "inspect_now" ? "text-warn" : s === "plan_inspection" ? "text-caution" : "text-normal",
                  )}
                  aria-label={`${f.subset} : ${f.status_counts[s]} moteurs, ${STATUS_META[s].short}`}
                >
                  <ToneMark tone={STATUS_META[s].tone} className="size-2" />
                  {f.status_counts[s]}
                </Link>
              ))}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-right text-xs text-ink-3" style={{ paddingRight: countsW }}>
        Cycles restants estimés (RUL)
      </p>
      {hover && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 w-max max-w-64 -translate-x-1/2 -translate-y-full rounded-sm bg-ink px-3 py-2 text-xs text-canvas shadow-pop"
          style={{ left: clamp(hover.x, 110, width - 110), top: hover.y - 12 }}
        >
          <p className="font-semibold">
            {hover.engine.subset}, moteur {unitLabel(hover.engine.unit)}
          </p>
          <p className="readout mt-0.5">
            RUL {cycles(hover.engine.rul)} ({interval(hover.engine.rul_low, hover.engine.rul_high)})
          </p>
          <p className="opacity-80">{STATUS_META[hover.engine.status].short}, cliquer pour ouvrir</p>
        </div>
      )}
    </div>
  );
}
