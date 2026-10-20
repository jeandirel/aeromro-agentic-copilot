import type { FleetSummary } from "@/lib/api/schemas";
import { conditionsLabel, faultModes } from "@/lib/domain";
import { cycles, formatDate, int, percent } from "@/lib/format";
import { clamp, cn } from "@/lib/utils";
import { Section, Skeleton, Tip } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/states";

/** Coverage meter: share of test engines whose true RUL fell inside the announced interval. */
function CoverageMeter({ value, target }: { value: number; target: number }) {
  const below = value < target - 0.02;
  return (
    <div className="relative h-2 w-full rounded-[2px] bg-sunken" role="img" aria-label={`Couverture mesurée ${percent(value)}, cible ${percent(target)}`}>
      <span className={cn("absolute inset-y-0 left-0 rounded-[2px]", below ? "bg-caution-fill" : "bg-predicted")} style={{ width: `${clamp(value, 0, 1) * 100}%` }} />
      <span className="absolute -inset-y-1 w-0.5 bg-ink" style={{ left: `${clamp(target, 0, 1) * 100}%` }} />
    </div>
  );
}

export function ModelReliability({ fleets, loading, className }: { fleets: FleetSummary[] | undefined; loading: boolean; className?: string }) {
  return (
    <Section
      id="models"
      className={className}
      title="Fiabilité des modèles"
      description="Mesurée par l’API sur le jeu de test NASA. Un intervalle à 80 % devrait contenir la vraie valeur 8 fois sur 10."
      bodyClassName="p-0 sm:p-0"
    >
      {loading ? (
        <div className="space-y-3 p-5" aria-busy="true" aria-label="Chargement des métriques">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !fleets?.length ? (
        <div className="p-5">
          <EmptyState title="Aucune métrique publiée">Les flottes déployées ne renvoient pas de métadonnées de modèle.</EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {fleets.map((f) => {
            const coverage = f.model.test.interval_coverage_clipped ?? null;
            const target = f.model.interval.target_coverage ?? 0.8;
            return (
              <li key={f.subset} className="px-5 py-4 sm:px-6">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="ident font-semibold text-ink">{f.subset}</p>
                  <Tip content="Erreur quadratique moyenne du RUL sur les moteurs de test, RUL réel plafonné à 125 cycles comme à l’entraînement.">
                    <button type="button" className="cursor-help text-xs text-ink-2">
                      {f.model.test.rmse_clipped === null ? (
                        "RMSE non publiée"
                      ) : (
                        <>
                          RMSE <span className="readout text-sm text-predicted">{cycles(f.model.test.rmse_clipped)}</span> cycles
                        </>
                      )}
                    </button>
                  </Tip>
                </div>
                <p className="mt-0.5 text-xs text-ink-3">
                  {conditionsLabel(f.conditions)}, dégradation {faultModes(f.fault_modes)}
                </p>
                {coverage !== null ? (
                  <div className="mt-3">
                    <div className="mb-1.5 flex items-baseline justify-between text-xs">
                      <span className="text-ink-2">Couverture de l’intervalle</span>
                      <span>
                        <span className={cn("readout", coverage < target - 0.02 ? "text-caution" : "text-predicted")}>{percent(coverage)}</span>
                        <span className="text-ink-3"> pour {percent(target)} visés</span>
                      </span>
                    </div>
                    <CoverageMeter value={coverage} target={target} />
                    {coverage < target - 0.02 && <p className="mt-1.5 text-xs text-caution">Intervalle trop optimiste sur ce jeu de test : à interpréter avec prudence.</p>}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-ink-3">Couverture non publiée.</p>
                )}
                <p className="mt-2 text-xs text-ink-3">
                  Entraîné le {formatDate(f.model.trained_at)} sur {int(f.model.n_train_engines)} moteurs
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
