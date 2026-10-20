import { Download, X } from "lucide-react";
import { useDeferredValue, useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useEngineLists, useFleets } from "@/lib/api/queries";
import { FLEET_IDS, fleetIdSchema, statusSchema, type Engine, type EngineStatus, type FleetId } from "@/lib/api/schemas";
import { downloadCsv } from "@/lib/csv";
import { SORT_OPTIONS, sortEngines, STATUS_META, type SortKey } from "@/lib/domain";
import { int, plural } from "@/lib/format";
import { useDocumentTitle } from "@/lib/hooks";
import { cn, niceMax } from "@/lib/utils";
import { ToneMark } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchField, Segmented, SelectField, Skeleton } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { EngineDetailPanel, NoEngineSelected } from "./engine-detail";
import { EngineTable } from "./engine-table";

type FleetFilter = FleetId | "all";
type StatusFilter = EngineStatus | "all";

function useFilters() {
  const [params, setParams] = useSearchParams();
  const fleetParam = params.get("fleet");
  const fleet: FleetFilter = fleetIdSchema.safeParse(fleetParam).success ? (fleetParam as FleetId) : "all";
  const statusParam = params.get("status");
  const status: StatusFilter = statusSchema.safeParse(statusParam).success ? (statusParam as EngineStatus) : "all";
  const sortParam = params.get("sort");
  const sort: SortKey = SORT_OPTIONS.some((o) => o.value === sortParam) ? (sortParam as SortKey) : "priority";
  const query = (params.get("q") ?? "").slice(0, 12);
  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || v === "all" || (k === "sort" && v === "priority")) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  return { fleet, status, sort, query, update, search: params.toString() };
}

export default function EnginesPage() {
  const { subset: subsetParam, unit: unitParam } = useParams();
  const selectedSubset = fleetIdSchema.safeParse(subsetParam).success ? (subsetParam as FleetId) : null;
  const unitNumber = unitParam && /^[1-9][0-9]{0,3}$/.test(unitParam) ? Number(unitParam) : null;
  const selected = selectedSubset && unitNumber ? { subset: selectedSubset, unit: unitNumber } : null;
  const invalidSelection = Boolean(subsetParam || unitParam) && !selected;

  useDocumentTitle(selected ? `${selected.subset} moteur ${selected.unit}` : "Santé moteur");
  const filters = useFilters();
  const fleets = useFleets();
  const available = useMemo(
    () => (fleets.data ? fleets.data.map((f) => f.subset as FleetId) : [...FLEET_IDS]),
    [fleets.data],
  );
  const lists = useEngineLists(available);
  const deferredQuery = useDeferredValue(filters.query);

  const allEngines = useMemo(() => (lists.data ?? []).flatMap((l) => l.engines), [lists.data]);
  const inFleet = useMemo(() => (filters.fleet === "all" ? allEngines : allEngines.filter((e) => e.subset === filters.fleet)), [allEngines, filters.fleet]);
  const counts = useMemo(() => {
    const c: Record<EngineStatus, number> = { inspect_now: 0, plan_inspection: 0, healthy: 0 };
    inFleet.forEach((e) => (c[e.status] += 1));
    return c;
  }, [inFleet]);
  const rows = useMemo(() => {
    const q = deferredQuery.replace(/[^0-9]/g, "");
    const filtered = inFleet.filter((e) => (filters.status === "all" || e.status === filters.status) && (!q || String(e.unit).includes(q.replace(/^0+/, "") || "0")));
    return sortEngines(filtered, filters.sort);
  }, [inFleet, filters.status, filters.sort, deferredQuery]);
  const max = useMemo(() => niceMax(Math.max(150, ...allEngines.map((e) => e.rul))), [allEngines]);
  const thresholds = lists.data?.[0]?.thresholds;
  const critical = useMemo(() => sortEngines(inFleet, "priority")[0], [inFleet]);

  const exportRows = (list: Engine[]) =>
    downloadCsv(
      `aeromro_${filters.fleet === "all" ? "toutes-flottes" : filters.fleet}_${filters.status}_moteurs.csv`,
      list,
      ["subset", "unit", "cycles_flown", "rul", "rul_low", "rul_high", "status", "confidence"],
    );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className={cn("max-w-[60ch]", selected && "sr-only lg:not-sr-only")}>
          <h1 className="text-2xl font-semibold sm:text-3xl">Santé moteur</h1>
          <p className="mt-1 text-ink-2">Recherchez un moteur, filtrez par flotte ou par statut, puis ouvrez son diagnostic : valeurs observées, prédictions du modèle et recommandation.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => exportRows(rows)} disabled={!rows.length} className={cn(selected && "hidden lg:inline-flex")}>
          <Download aria-hidden="true" />
          Exporter {plural(rows.length, "moteur", "moteurs")} en CSV
        </Button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start xl:gap-6">
        {/* List */}
        <section aria-label="Liste des moteurs" className={cn("min-w-0 rounded-lg border border-line bg-surface lg:sticky lg:top-24", selected && "hidden lg:block")}>
          <div className="space-y-3 border-b border-line p-4">
            <Segmented<FleetFilter>
              label="Flotte"
              value={filters.fleet}
              onChange={(v) => filters.update({ fleet: v })}
              className="w-full [&>*]:flex-1"
              options={[{ value: "all", label: "Toutes", ariaLabel: "Toutes les flottes" }, ...available.map((f) => ({ value: f as FleetFilter, label: f }))]}
            />
            <div className="flex gap-2">
              <SearchField
                label="Rechercher un numéro de moteur"
                placeholder="N° de moteur"
                inputMode="numeric"
                value={filters.query}
                onChange={(e) => filters.update({ q: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) })}
                className="flex-1"
              />
              <SelectField label="Trier" hideLabel value={filters.sort} onChange={(e) => filters.update({ sort: e.target.value })} className="w-[46%] max-w-56">
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </SelectField>
            </div>
            <fieldset>
              <legend className="sr-only">Filtrer par statut</legend>
              <div className="flex flex-wrap gap-1.5">
                {(["all", "inspect_now", "plan_inspection", "healthy"] as const).map((s) => {
                  const active = filters.status === s;
                  const count = s === "all" ? inFleet.length : counts[s];
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={active}
                      onClick={() => filters.update({ status: s })}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-xs transition-colors",
                        active ? "border-ink bg-ink text-canvas" : "border-line-strong text-ink-2 hover:border-ink-2 hover:text-ink",
                      )}
                    >
                      {s !== "all" && <ToneMark tone={STATUS_META[s].tone} className={cn(!active && (s === "inspect_now" ? "text-warn" : s === "plan_inspection" ? "text-caution" : "text-normal"))} />}
                      {s === "all" ? "Tous" : STATUS_META[s].short}
                      <span className="readout opacity-80">{lists.data ? int(count) : "…"}</span>
                    </button>
                  );
                })}
                {(filters.status !== "all" || filters.query || filters.fleet !== "all" || filters.sort !== "priority") && (
                  <button
                    type="button"
                    onClick={() => filters.update({ status: null, q: null, fleet: null, sort: null })}
                    className="inline-flex h-8 items-center gap-1 rounded-sm px-2 text-xs text-policy hover:underline"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                    Réinitialiser
                  </button>
                )}
              </div>
            </fieldset>
          </div>
          {lists.error && !lists.data ? (
            <div className="p-4">
              <ErrorState error={lists.error} title="Moteurs indisponibles" onRetry={() => void lists.refetch()} />
            </div>
          ) : !lists.data || !thresholds ? (
            <div className="space-y-2 p-4" aria-busy="true" aria-label="Chargement des moteurs">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <EngineTable rows={rows} showFleet={filters.fleet === "all"} thresholds={thresholds} max={max} selected={selected} search={filters.search} />
          )}
        </section>

        {/* Detail */}
        <div className={cn("min-w-0", !selected && "hidden lg:block")}>
          {invalidSelection ? (
            <ErrorState error={new Error("L’adresse ne désigne pas un moteur valide (flotte FD001 à FD004, numéro entier).")} title="Moteur introuvable" />
          ) : selected ? (
            <EngineDetailPanel key={`${selected.subset}-${selected.unit}`} subset={selected.subset} unit={selected.unit} max={max} backTo={`/engines${filters.search ? `?${filters.search}` : ""}`} />
          ) : (
            <NoEngineSelected critical={critical} search={filters.search} />
          )}
        </div>
      </div>
      {selected && (
        <p className="text-sm lg:hidden">
          <Link to={`/engines${filters.search ? `?${filters.search}` : ""}`} className="text-policy hover:underline">
            Revenir à la liste des moteurs
          </Link>
        </p>
      )}
    </div>
  );
}
