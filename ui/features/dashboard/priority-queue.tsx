import { MessageSquareText } from "lucide-react";
import { Link } from "react-router";
import type { Engine, Thresholds } from "@/lib/api/schemas";
import { cycles, int, interval, percent, unitLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RulTape } from "@/components/instruments/rul-tape";
import { FleetTag, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Section, Skeleton, Tip } from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/states";

const LIMIT = 10;

export function PriorityQueue({
  engines,
  thresholds,
  max,
  loading,
  error,
  onRetry,
  className,
}: {
  engines: Engine[];
  thresholds: Thresholds | undefined;
  max: number;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  className?: string;
}) {
  const rows = engines.slice(0, LIMIT);
  const urgent = engines.filter((e) => e.status === "inspect_now").length;

  return (
    <Section
      id="priority"
      className={className}
      title="File d’inspection"
      description="Les moteurs des quatre flottes, du plus urgent au moins urgent : statut, puis cycles restants estimés."
      actions={
        <Button asChild size="sm" variant="secondary">
          <Link to="/engines?status=inspect_now">Tous les moteurs à inspecter ({int(urgent)})</Link>
        </Button>
      }
      bodyClassName="p-0 sm:p-0"
    >
      {error && !engines.length ? (
        <div className="p-5">
          <ErrorState error={error} onRetry={onRetry} />
        </div>
      ) : loading || !thresholds ? (
        <div className="space-y-2 p-5" aria-busy="true" aria-label="Chargement de la file d’inspection">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-5">
          <EmptyState title="Aucun moteur en service">L’API ne renvoie aucun moteur pour les flottes déployées.</EmptyState>
        </div>
      ) : (
        <>
          {/* Wide screens: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Les {rows.length} moteurs les plus prioritaires</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th scope="col" className="py-2.5 pl-6 pr-3 font-medium">Moteur</th>
                  <th scope="col" className="px-3 font-medium">Statut</th>
                  <th scope="col" className="w-[30%] px-3 font-medium">RUL estimé</th>
                  <th scope="col" className="px-3 font-medium">Intervalle 80 %</th>
                  <th scope="col" className="px-3 text-right font-medium">Cycles parcourus</th>
                  <th scope="col" className="px-3 text-right font-medium">Confiance</th>
                  <th scope="col" className="pl-3 pr-6"><span className="sr-only">Copilote</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={`${e.subset}-${e.unit}`} className="relative border-b border-line last:border-b-0 hover:bg-surface-2">
                    <th scope="row" className="py-2.5 pl-6 pr-3 text-left font-normal">
                      <Link to={`/engines/${e.subset}/${e.unit}`} className="stretched-link inline-flex items-center gap-2 rounded-xs">
                        <FleetTag subset={e.subset} />
                        <span className="ident text-ink">{unitLabel(e.unit)}</span>
                        <span className="sr-only">, ouvrir le diagnostic</span>
                      </Link>
                    </th>
                    <td className="px-3"><StatusBadge status={e.status} /></td>
                    <td className="px-3">
                      <div className="flex items-center gap-3">
                        <span className="readout w-12 text-right text-predicted">{cycles(e.rul)}</span>
                        <RulTape rul={e.rul} low={e.rul_low} high={e.rul_high} thresholds={thresholds} max={max} />
                      </div>
                    </td>
                    <td className="readout whitespace-nowrap px-3 text-predicted">{interval(e.rul_low, e.rul_high)}</td>
                    <td className="readout px-3 text-right text-ink">{int(e.cycles_flown)}</td>
                    <td className={cn("readout px-3 text-right", e.confidence < 0.7 ? "text-caution" : "text-predicted")}>{percent(e.confidence)}</td>
                    <td className="relative z-[1] pl-3 pr-6 text-right">
                      <Tip content={`Analyser ${e.subset} moteur ${unitLabel(e.unit)} avec le copilote`}>
                        <Button asChild variant="ghost" size="icon-sm" aria-label={`Analyser ${e.subset} moteur ${unitLabel(e.unit)} avec le copilote`}>
                          <Link to={`/copilot?fleet=${e.subset}&engine=${e.unit}`}>
                            <MessageSquareText aria-hidden="true" />
                          </Link>
                        </Button>
                      </Tip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Small screens: list */}
          <ol className="divide-y divide-line md:hidden" aria-label={`Les ${rows.length} moteurs les plus prioritaires`}>
            {rows.map((e) => (
              <li key={`${e.subset}-${e.unit}`} className="relative px-5 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <Link to={`/engines/${e.subset}/${e.unit}`} className="stretched-link inline-flex items-center gap-2">
                    <FleetTag subset={e.subset} />
                    <span className="ident">{unitLabel(e.unit)}</span>
                  </Link>
                  <StatusBadge status={e.status} />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className="readout w-12 text-predicted">{cycles(e.rul)}</span>
                  <RulTape rul={e.rul} low={e.rul_low} high={e.rul_high} thresholds={thresholds} max={max} />
                </div>
                <p className="mt-1 text-xs text-ink-3">
                  Intervalle <span className="readout text-predicted">{interval(e.rul_low, e.rul_high)}</span>, {int(e.cycles_flown)} cycles parcourus, confiance{" "}
                  <span className="readout">{percent(e.confidence)}</span>
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
    </Section>
  );
}
