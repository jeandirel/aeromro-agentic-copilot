import { ArrowLeft, ArrowUpRight, ClipboardCheck, Download, MessageSquareText } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Link } from "react-router";
import { useEngineDetail, useEngines, useFleets } from "@/lib/api/queries";
import type { Engine, FleetId } from "@/lib/api/schemas";
import { downloadCsv } from "@/lib/csv";
import { STATUS_META, statusRule } from "@/lib/domain";
import { cycles, formatDate, int, interval, percent, unitLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProvenanceKey, Readout } from "@/components/instruments/provenance";
import { RulTape } from "@/components/instruments/rul-tape";
import { FleetTag, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Photo, photoCredit } from "@/components/ui/photo";
import { Segmented, Skeleton } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";

const RulHistoryChart = lazy(() => import("@/components/charts/rul-history-chart").then((m) => ({ default: m.RulHistoryChart })));
const SensorChart = lazy(() => import("@/components/charts/sensor-chart").then((m) => ({ default: m.SensorChart })));

const WINDOWS = ["30", "60", "120", "400"] as const;
type Window = (typeof WINDOWS)[number];

const toneText = { warn: "text-warn", caution: "text-caution", normal: "text-normal", policy: "text-policy", neutral: "text-ink-2" } as const;

export function EngineDetailPanel({ subset, unit, max, backTo }: { subset: FleetId; unit: number; max: number; backTo: string }) {
  const [windowSize, setWindowSize] = useState<Window>("60");
  const detail = useEngineDetail(subset, unit, Number(windowSize));
  const list = useEngines(subset);
  const fleets = useFleets();
  const model = fleets.data?.find((f) => f.subset === subset)?.model;
  const thresholds = list.data?.thresholds;
  const engine = detail.data?.engine;

  if (detail.error && !detail.data) {
    return (
      <div className="space-y-4">
        <BackLink to={backTo} />
        <ErrorState error={detail.error} title={`${subset}, moteur ${unitLabel(unit)} indisponible`} onRetry={() => void detail.refetch()} />
      </div>
    );
  }

  return (
    <article aria-labelledby="engine-title" className="@container space-y-5">
      <BackLink to={backTo} />
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-line bg-surface p-5 sm:p-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FleetTag subset={subset} />
            {engine ? <StatusBadge status={engine.status} short={false} /> : <Skeleton className="h-6 w-40" />}
          </div>
          <h2 id="engine-title" className="mt-2 text-2xl font-semibold sm:text-3xl">
            Moteur <span className="ident">{unitLabel(unit)}</span>
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="primary">
            <Link to={`/copilot?fleet=${subset}&engine=${unit}`}>
              <MessageSquareText aria-hidden="true" />
              Analyser avec le copilote
            </Link>
          </Button>
          <Button
            variant="secondary"
            disabled={!detail.data}
            onClick={() =>
              detail.data &&
              downloadCsv(`aeromro_${subset}_moteur_${unit}_historique.csv`, detail.data.history, Object.keys(detail.data.history[0] ?? { cycle: 0 }))
            }
          >
            <Download aria-hidden="true" />
            Historique CSV
          </Button>
        </div>
      </header>

      <section aria-labelledby="diag-title" className="rounded-lg border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <h3 id="diag-title" className="text-lg font-semibold">Diagnostic de durée de vie</h3>
          <ProvenanceKey />
        </div>
        <div className="px-5 py-5 sm:px-6">
          {engine && thresholds ? (
            <>
              <RulTape size="lg" rul={engine.rul} low={engine.rul_low} high={engine.rul_high} thresholds={thresholds} max={max} />
              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 @2xl:grid-cols-4">
                <Readout label="Cycles parcourus" value={int(engine.cycles_flown)} provenance="observed" hint="Depuis le début de l’enregistrement" />
                <Readout label="RUL estimé" value={cycles(engine.rul)} unit="cycles" provenance="predicted" hint="Cycles restants" />
                <Readout label="Intervalle à 80 %" value={interval(engine.rul_low, engine.rul_high)} provenance="predicted" size="sm" hint="Bornes basse et haute" />
                <Readout
                  label="Confiance du statut"
                  value={percent(engine.confidence)}
                  provenance="predicted"
                  hint={engine.confidence < 1 ? "L’intervalle chevauche un seuil" : "Intervalle dans une seule bande"}
                />
              </dl>
              <div className="mt-6 flex gap-3 rounded-md border-l-[3px] border-policy bg-policy-soft px-4 py-3.5">
                <ClipboardCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-policy" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-policy">Recommandation</p>
                  <p className={cn("mt-0.5 font-semibold", toneText[STATUS_META[engine.status].tone])}>{STATUS_META[engine.status].action}.</p>
                  <p className="mt-0.5 text-sm text-ink-2">
                    Règle : {statusRule(engine.status, thresholds)}. Toute décision reste validée par un ingénieur de maintenance certifié.
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm text-ink-2">
                Le statut compare les <strong className="font-semibold text-ink">cycles restants estimés</strong> aux seuils de {thresholds.inspect_now} et {thresholds.plan_inspection} cycles, jamais les cycles déjà parcourus. La confiance est la part de l’intervalle à 80 % située dans la même bande que l’estimation.
              </p>
            </>
          ) : (
            <div className="space-y-4" aria-busy="true" aria-label="Chargement du diagnostic">
              <Skeleton className="h-20 w-full" />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="history-title" className="rounded-lg border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div>
            <h3 id="history-title" className="text-lg font-semibold">Historique des prédictions</h3>
            <p className="text-sm text-ink-2">Estimation recalculée à chaque cycle observé, avec son intervalle.</p>
          </div>
          <Segmented<Window>
            label="Fenêtre d’historique"
            value={windowSize}
            onChange={setWindowSize}
            options={WINDOWS.map((w) => ({ value: w, label: w === "400" ? "Tout" : w, ariaLabel: w === "400" ? "Tout l’historique" : `${w} derniers cycles` }))}
          />
        </div>
        <div className={cn("px-3 py-4 transition-opacity sm:px-5", detail.isPlaceholderData && "opacity-60")} aria-busy={detail.isFetching}>
          {detail.data && thresholds ? (
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <RulHistoryChart history={detail.data.history} thresholds={thresholds} />
            </Suspense>
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </div>
      </section>

      <section aria-labelledby="sensors-title" className="rounded-lg border border-line bg-surface">
        <div className="border-b border-line px-5 py-4 sm:px-6">
          <h3 id="sensors-title" className="text-lg font-semibold">Capteurs clés</h3>
          <p className="text-sm text-ink-2">Mesures observées, normalisées par régime de vol par le modèle. Valeur de fin de période et variation sur la fenêtre affichée.</p>
        </div>
        <div className="grid gap-3 px-5 py-5 @lg:grid-cols-2 sm:px-6">
          {detail.data ? (
            Object.entries(detail.data.sensors).map(([key, label]) => (
              <Suspense key={key} fallback={<Skeleton className="h-32" />}>
                <SensorChart history={detail.data!.history} sensorKey={key} apiLabel={label} />
              </Suspense>
            ))
          ) : (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)
          )}
        </div>
      </section>

      {model && (
        <p className="text-xs text-ink-3">
          Modèle RUL {subset} entraîné le {formatDate(model.trained_at)} sur {int(model.n_train_engines)} moteurs (scikit-learn {model.sklearn_version ?? "—"}). Données simulées NASA C-MAPSS : aide à la décision, sans valeur de certification.
        </p>
      )}
    </article>
  );
}

function BackLink({ to }: { to: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1.5 text-sm text-policy hover:underline lg:hidden">
      <ArrowLeft aria-hidden="true" className="size-4" />
      Liste des moteurs
    </Link>
  );
}

export function NoEngineSelected({ critical, search }: { critical: Engine | undefined; search: string }) {
  const credit = photoCredit("turbofan-inspection");
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="relative">
        <Photo
          slug="turbofan-inspection"
          alt="Deux techniciens de la NASA examinent un petit turboréacteur à double flux monté sur un banc d’essai."
          sizes="(min-width: 1024px) 56vw, 100vw"
          className="aspect-[16/9] w-full"
          position="50% 40%"
        />
        <a href={credit.href} target="_blank" rel="noopener noreferrer" className="absolute bottom-2 right-3 rounded-xs bg-black/45 px-1.5 py-0.5 text-[0.65rem] text-white/90 hover:text-white">
          Photo {credit.label}
          <span className="sr-only"> (source, nouvel onglet)</span>
        </a>
      </div>
      <div className="p-6">
        <h2 className="text-xl font-semibold">Sélectionnez un moteur</h2>
        <p className="mt-1 max-w-[56ch] text-ink-2">
          Le diagnostic distingue ce qui a été observé (cycles, capteurs), ce que le modèle prédit (RUL, intervalle, confiance) et la recommandation qui en découle.
        </p>
        {critical && (
          <Button asChild variant="primary" className="mt-5">
            <Link to={`/engines/${critical.subset}/${critical.unit}${search ? `?${search}` : ""}`}>
              Ouvrir le plus prioritaire : {critical.subset}, moteur {unitLabel(critical.unit)}
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
