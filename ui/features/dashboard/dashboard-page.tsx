import { ArrowUpRight, MessageSquareText } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { useEngineLists, useFleets } from "@/lib/api/queries";
import type { Engine, FleetId, FleetSummary, Thresholds } from "@/lib/api/schemas";
import { compareEngines, STATUS_META, type Tone } from "@/lib/domain";
import { int, plural } from "@/lib/format";
import { useDocumentTitle } from "@/lib/hooks";
import { cn, niceMax } from "@/lib/utils";
import { FleetStrip } from "@/components/instruments/fleet-strip";
import { ToneMark } from "@/components/ui/badge";
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

const KPI_TONE = { warn: "text-warn", caution: "text-caution", normal: "text-normal", policy: "text-policy", neutral: "text-ink-2" } as const;

/**
 * Fleet status band: the headline and the four counts an engineer acts on, in a compact dark
 * band (dark tokens in both themes, like a flight-deck display). The photograph stays as a dimmed
 * backdrop so the data, not the picture, owns the first screen.
 */
function Hero({
  fleets,
  critical,
  thresholds,
  error,
  onRetry,
}: {
  fleets: FleetSummary[] | undefined;
  critical: Engine | undefined;
  thresholds: Thresholds | undefined;
  error: unknown;
  onRetry: () => void;
}) {
  const t = fleets ? totals(fleets) : null;
  const credit = photoCredit("hangar-b777");
  const kpis: { key: string; label: string; value: number | undefined; hint: string; tone: Tone; to: string }[] = [
    {
      key: "inspect",
      label: STATUS_META.inspect_now.short,
      value: t?.inspect,
      hint: thresholds ? `RUL ≤ ${thresholds.inspect_now} cycles` : "Avant le prochain vol",
      tone: "warn",
      to: "/engines?status=inspect_now",
    },
    {
      key: "plan",
      label: STATUS_META.plan_inspection.short,
      value: t?.plan,
      hint: thresholds ? `RUL ${thresholds.inspect_now} à ${thresholds.plan_inspection} cycles` : "Prochaine opportunité",
      tone: "caution",
      to: "/engines?status=plan_inspection",
    },
    {
      key: "healthy",
      label: STATUS_META.healthy.short,
      value: t?.healthy,
      hint: thresholds ? `RUL > ${thresholds.plan_inspection} cycles` : "Surveillance normale",
      tone: "normal",
      to: "/engines?status=healthy",
    },
    {
      key: "all",
      label: "Moteurs suivis",
      value: t?.engines,
      hint: fleets ? plural(fleets.length, "flotte simulée", "flottes simulées") : "Flottes simulées",
      tone: "neutral",
      to: "/engines",
    },
  ];

  return (
    <section aria-labelledby="hero-title" className="scheme-dark relative isolate overflow-hidden rounded-xl border border-line bg-canvas text-ink">
      <Photo
        slug="hangar-b777"
        alt="Boeing 777 de la NASA en maintenance dans un hangar du centre de recherche Langley."
        sizes="(min-width: 1024px) 60vw, 100vw"
        priority
        position="62% 55%"
        className="absolute inset-y-0 right-0 -z-10 w-full opacity-45 sm:w-3/4 lg:w-2/3"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,var(--canvas)_0%,var(--canvas)_30%,color-mix(in_srgb,var(--canvas)_55%,transparent)_70%,color-mix(in_srgb,var(--canvas)_20%,transparent)_100%)]" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,var(--canvas)_0%,color-mix(in_srgb,var(--canvas)_40%,transparent)_55%,transparent_100%)]" />

      <div className="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between lg:p-8">
        <div className="max-w-[44rem]">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-ink-3">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-normal" />
            Vue d’ensemble de la flotte
          </p>
          {error && !fleets ? (
            <div className="mt-3 max-w-md">
              <ErrorState error={error} title="Flotte indisponible" onRetry={onRetry} />
            </div>
          ) : (
            <h1 id="hero-title" className="mt-2 text-[1.6rem] font-semibold leading-[1.12] tracking-[-0.02em] sm:text-3xl lg:text-[2.35rem] [font-stretch:112%]">
              {t ? (
                <span className="block animate-rise">
                  {t.inspect === 0
                    ? "Aucun moteur à inspecter avant son prochain vol."
                    : t.inspect === 1
                      ? "1 moteur à inspecter avant son prochain vol."
                      : `${int(t.inspect)} moteurs à inspecter avant leur prochain vol.`}
                </span>
              ) : (
                <>
                  <span className="sr-only">Chargement de l’état de la flotte</span>
                  <Skeleton className="h-9 w-full max-w-lg bg-white/10" />
                </>
              )}
            </h1>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button asChild variant="primary">
            <Link to="/engines?status=inspect_now">
              Ouvrir les moteurs à inspecter
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="secondary" className="border-line-strong bg-surface/60 backdrop-blur-sm">
            <Link to={critical ? `/copilot?fleet=${critical.subset}&engine=${critical.unit}` : "/copilot"}>
              <MessageSquareText aria-hidden="true" />
              Interroger le copilote
            </Link>
          </Button>
        </div>
      </div>

      <ul aria-label="État de la flotte" className="grid grid-cols-2 border-t border-line/80 sm:grid-cols-4">
        {kpis.map((k, i) => (
          <li key={k.key} className={cn("border-line/80", i % 2 === 1 && "border-l", i >= 2 && "border-t sm:border-t-0", i === 2 && "sm:border-l")}>
            <Link to={k.to} className="group flex h-full flex-col px-5 py-4 transition-colors hover:bg-surface/50 sm:px-7 lg:px-8">
              <span className={cn("flex items-center gap-1.5 text-xs font-medium", KPI_TONE[k.tone])}>
                {k.tone !== "neutral" && <ToneMark tone={k.tone} />}
                {k.label}
              </span>
              <span className="readout mt-auto block pt-1 text-[1.75rem] font-semibold leading-none tracking-[-0.01em] text-ink sm:text-[2rem]">
                {k.value === undefined ? <Skeleton className="h-8 w-16 bg-white/10" /> : int(k.value)}
              </span>
              <span className="mt-1.5 block text-xs text-ink-3 group-hover:text-ink-2">{k.hint}</span>
            </Link>
          </li>
        ))}
      </ul>

      <a
        href={credit.href}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute right-3 top-2 hidden text-[0.65rem] text-ink-3 hover:text-ink sm:block"
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
      <Hero fleets={fleets.data} critical={all[0]} thresholds={thresholds} error={fleets.error} onRetry={() => void fleets.refetch()} />

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

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
        <PriorityQueue className="lg:col-span-8" engines={all} thresholds={thresholds} max={max} loading={lists.isPending} error={lists.error} onRetry={() => void lists.refetch()} />
        <ModelReliability className="lg:col-span-4" fleets={fleets.data} loading={fleets.isPending} />
      </div>
    </div>
  );
}
