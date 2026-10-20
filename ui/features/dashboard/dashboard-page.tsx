import { ArrowUpRight, MessageSquareText } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { useEngineLists, useFleets } from "@/lib/api/queries";
import type { Engine, FleetId, FleetSummary } from "@/lib/api/schemas";
import { compareEngines } from "@/lib/domain";
import { int, plural } from "@/lib/format";
import { useDocumentTitle } from "@/lib/hooks";
import { niceMax } from "@/lib/utils";
import { FleetStrip } from "@/components/instruments/fleet-strip";
import { Button } from "@/components/ui/button";
import { Photo, photoCredit } from "@/components/ui/photo";
import { Section, Skeleton } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { ModelReliability } from "./model-reliability";
import { PriorityQueue } from "./priority-queue";

function totals(fleets: FleetSummary[]) {
  return fleets.reduce(
    (acc, f) => ({
      engines: acc.engines + f.engines,
      inspect: acc.inspect + f.status_counts.inspect_now,
      plan: acc.plan + f.status_counts.plan_inspection,
      healthy: acc.healthy + f.status_counts.healthy,
    }),
    { engines: 0, inspect: 0, plan: 0, healthy: 0 },
  );
}

function Hero({ fleets, critical, error, onRetry }: { fleets: FleetSummary[] | undefined; critical: Engine | undefined; error: unknown; onRetry: () => void }) {
  const t = fleets ? totals(fleets) : null;
  const credit = photoCredit("hangar-b777");
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden rounded-xl bg-[#0b1520] text-[#f2f6fa]">
      <Photo
        slug="hangar-b777"
        alt="Boeing 777 de la NASA en maintenance dans un hangar du centre de recherche Langley."
        sizes="(min-width: 1024px) calc(100vw - 304px), 100vw"
        priority
        position="62% 55%"
        className="absolute inset-0 -z-10"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(var(--scrim)/0.92)_0%,rgb(var(--scrim)/0.78)_38%,rgb(var(--scrim)/0.18)_78%,rgb(var(--scrim)/0.05)_100%)]" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,rgb(var(--scrim)/0.82)_0%,rgb(var(--scrim)/0.55)_60%,rgb(var(--scrim)/0.35)_100%)] sm:hidden" />
      <div className="flex min-h-[23rem] flex-col justify-end gap-6 p-6 sm:min-h-[26rem] sm:p-10 lg:min-h-[28rem] lg:p-12">
        <div className="max-w-[40rem]">
          <p className="text-sm text-[#c9d5e1]">Vue d’ensemble de la flotte</p>
          {error && !fleets ? (
            <div className="mt-4 max-w-md text-ink">
              <ErrorState error={error} title="Flotte indisponible" onRetry={onRetry} />
            </div>
          ) : (
            <>
              <h1 id="hero-title" className="mt-3 text-[2rem] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-4xl lg:text-[3.25rem] [font-stretch:112%]">
                {t ? (
                  <span className="block animate-rise">
                    {t.inspect === 0
                      ? "Aucun moteur à inspecter avant son prochain vol."
                      : t.inspect === 1
                        ? "1 moteur doit être inspecté avant son prochain vol."
                        : `${int(t.inspect)} moteurs doivent être inspectés avant leur prochain vol.`}
                  </span>
                ) : (
                  <>
                    <span className="sr-only">Chargement de l’état de la flotte</span>
                    <Skeleton className="h-11 w-full max-w-lg bg-white/15" />
                    <Skeleton className="mt-3 h-11 w-2/3 bg-white/15" />
                  </>
                )}
              </h1>
              {t && (
                <p className="mt-4 max-w-[36rem] animate-rise text-base text-[#d6e0ea] [animation-delay:120ms] sm:text-lg">
                  {t.plan === 0 ? "Aucun moteur n’attend" : t.plan === 1 ? "1 moteur attend" : `${int(t.plan)} moteurs attendent`} une inspection planifiée, {plural(t.healthy, "est", "sont")} en surveillance normale.{" "}
                  {plural(t.engines, "moteur suivi", "moteurs suivis")} dans {plural(fleets?.length ?? 0, "flotte simulée", "flottes simulées")}.
                </p>
              )}
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="primary" className="bg-[#5cc9e6] text-[#04202a] hover:bg-[#8bdaf0]">
            <Link to="/engines?status=inspect_now">
              Ouvrir les moteurs à inspecter
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="inverse">
            <Link to={critical ? `/copilot?fleet=${critical.subset}&engine=${critical.unit}` : "/copilot"}>
              <MessageSquareText aria-hidden="true" />
              Interroger le copilote
            </Link>
          </Button>
        </div>
      </div>
      <a
        href={credit.href}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-2 right-3 text-[0.65rem] text-white/70 hover:text-white"
      >
        Photo {credit.label}
        <span className="sr-only"> (source, nouvel onglet)</span>
      </a>
    </section>
  );
}

export default function DashboardPage() {
  useDocumentTitle("Vue d’ensemble");
  const fleets = useFleets();
  const subsets = useMemo(() => (fleets.data ?? []).map((f) => f.subset as FleetId), [fleets.data]);
  const lists = useEngineLists(subsets);
  const all = useMemo(() => (lists.data ?? []).flatMap((l) => l.engines).sort(compareEngines), [lists.data]);
  const max = useMemo(() => niceMax(Math.max(150, ...all.map((e) => e.rul))), [all]);
  const thresholds = lists.data?.[0]?.thresholds;

  return (
    <div className="space-y-6 lg:space-y-8">
      <Hero fleets={fleets.data} critical={all[0]} error={fleets.error} onRetry={() => void fleets.refetch()} />

      <Section
        id="rul-map"
        title="Carte de vie résiduelle"
        description="Chaque point est un moteur en service, placé selon ses cycles restants estimés. Les bandes sont les seuils d’inspection de l’API."
        bodyClassName="pt-3"
      >
        {lists.error && !lists.data ? (
          <ErrorState error={lists.error} title="Moteurs indisponibles" onRetry={() => void lists.refetch()} />
        ) : fleets.data && lists.data ? (
          <FleetStrip fleets={fleets.data} lists={lists.data} max={max} />
        ) : (
          <div className="space-y-3" aria-busy="true" aria-label="Chargement de la carte">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <PriorityQueue className="lg:col-span-8" engines={all} thresholds={thresholds} max={max} loading={lists.isPending} error={lists.error} onRetry={() => void lists.refetch()} />
        <ModelReliability className="lg:col-span-4" fleets={fleets.data} loading={fleets.isPending} />
      </div>
    </div>
  );
}
