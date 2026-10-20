import { useState } from "react";
import { Link } from "react-router";
import type { Engine, Thresholds } from "@/lib/api/schemas";
import { STATUS_META } from "@/lib/domain";
import { cycles, int, unitLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RulTape } from "@/components/instruments/rul-tape";
import { FleetTag, ToneMark } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

const PAGE = 150;

const toneText = { warn: "text-warn", caution: "text-caution", normal: "text-normal", policy: "text-policy", neutral: "text-ink-2" } as const;

export function EngineTable({
  rows,
  showFleet,
  thresholds,
  max,
  selected,
  search,
}: {
  rows: Engine[];
  showFleet: boolean;
  thresholds: Thresholds;
  max: number;
  selected: { subset: string; unit: number } | null;
  search: string;
}) {
  const [limit, setLimit] = useState(PAGE);
  if (!rows.length) {
    return (
      <div className="p-4">
        <EmptyState title="Aucun moteur ne correspond">Modifiez la recherche ou les filtres de statut et de flotte.</EmptyState>
      </div>
    );
  }
  const visible = rows.slice(0, limit);
  return (
    <div className="@container scrollbar-thin overflow-y-auto lg:max-h-[calc(100dvh-20rem)]">
      <table className="w-full text-sm">
        <caption className="sr-only">{int(rows.length)} moteurs, triés selon le choix courant</caption>
        <thead className="sticky top-0 z-[2] bg-surface">
          <tr className="border-b border-line text-left text-xs text-ink-3">
            <th scope="col" className="py-2 pl-4 pr-2 font-medium">Moteur</th>
            <th scope="col" className="px-2 font-medium">Statut</th>
            <th scope="col" className="px-2 font-medium">RUL estimé</th>
            <th scope="col" className="px-2 pr-4 text-right font-medium">Cycles</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((e) => {
            const isSelected = selected?.subset === e.subset && selected.unit === e.unit;
            const meta = STATUS_META[e.status];
            return (
              <tr
                key={`${e.subset}-${e.unit}`}
                className={cn("relative border-b border-line last:border-b-0", isSelected ? "bg-policy-soft" : "hover:bg-surface-2")}
              >
                <th scope="row" className="py-2 pl-4 pr-2 text-left font-normal">
                  {isSelected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-policy" />}
                  <Link
                    to={`/engines/${e.subset}/${e.unit}${search ? `?${search}` : ""}`}
                    aria-current={isSelected ? "true" : undefined}
                    className="stretched-link inline-flex items-center gap-1.5 rounded-xs"
                  >
                    {showFleet && <FleetTag subset={e.subset} />}
                    <span className="ident text-ink">{unitLabel(e.unit)}</span>
                    <span className="sr-only">{showFleet ? "" : `, ${e.subset}`}</span>
                  </Link>
                </th>
                <td className="px-2">
                  {/* Narrow list: the shape and colour carry the status, the words stay for screen readers. */}
                  <span title={meta.short} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium", toneText[meta.tone])}>
                    <ToneMark tone={meta.tone} />
                    <span className="sr-only @[36rem]:not-sr-only">{meta.short}</span>
                  </span>
                </td>
                <td className="px-2">
                  <div className="flex items-center gap-2">
                    <span className="readout w-10 shrink-0 text-right text-predicted">{cycles(e.rul)}</span>
                    <RulTape className="min-w-12" rul={e.rul} low={e.rul_low} high={e.rul_high} thresholds={thresholds} max={max} />
                  </div>
                </td>
                <td className="readout px-2 pr-4 text-right text-ink">{int(e.cycles_flown)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > limit && (
        <div className="border-t border-line p-3 text-center">
          <Button size="sm" variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
            Afficher {int(Math.min(PAGE, rows.length - limit))} moteurs de plus ({int(rows.length - limit)} restants)
          </Button>
        </div>
      )}
    </div>
  );
}
