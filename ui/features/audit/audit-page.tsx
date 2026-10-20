import { Tabs } from "radix-ui";
import { Eraser, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useAudit } from "@/lib/api/queries";
import { copilotStore, useCopilotEntries, type AnswerEntry, type ErrorEntry } from "@/lib/copilot-store";
import { actionLabel, DECISION_META, policyReason } from "@/lib/domain";
import { formatDateTime, milliseconds, timeAgo, unitLabel } from "@/lib/format";
import { useDocumentTitle, useNow } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Badge, DecisionBadge, FleetTag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Photo, photoCredit } from "@/components/ui/photo";
import { SelectField, Skeleton } from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/states";

const LIMITS = [50, 100, 200] as const;

function GatewayLog() {
  const [limit, setLimit] = useState<number>(100);
  const [decision, setDecision] = useState("all");
  const [tool, setTool] = useState("all");
  const audit = useAudit(limit);
  const now = useNow();
  const records = useMemo(() => audit.data ?? [], [audit.data]);
  const tools = useMemo(() => [...new Set(records.map((r) => r.tool))].sort(), [records]);
  const rows = records.filter((r) => (decision === "all" || r.decision === decision) && (tool === "all" || r.tool === tool));
  const credit = photoCredit("engine-test-consoles");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField label="Décision" id="audit-decision" value={decision} onChange={(e) => setDecision(e.target.value)} className="w-48">
          <option value="all">Toutes</option>
          {Object.entries(DECISION_META).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </SelectField>
        <SelectField label="Outil" id="audit-tool" value={tool} onChange={(e) => setTool(e.target.value)} className="w-52">
          <option value="all">Tous</option>
          {tools.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </SelectField>
        <SelectField label="Derniers appels" id="audit-limit" value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-36">
          {LIMITS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </SelectField>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-ink-3">{audit.dataUpdatedAt ? `Mis à jour ${timeAgo(audit.dataUpdatedAt, now)}` : ""}</span>
          <Button variant="secondary" size="md" onClick={() => void audit.refetch()} disabled={audit.isFetching}>
            <RefreshCw aria-hidden="true" className={cn(audit.isFetching && "animate-spin")} />
            Actualiser
          </Button>
        </div>
      </div>

      {audit.error ? (
        <ErrorState error={audit.error} title="Journal indisponible" onRetry={() => void audit.refetch()} />
      ) : audit.isPending ? (
        <div className="space-y-2" aria-busy="true" aria-label="Chargement du journal">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="grid overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-[2fr_3fr]">
          <div className="relative min-h-44">
            <Photo slug="engine-test-consoles" alt="Consoles d’instrumentation d’un laboratoire d’essais moteurs de la NASA." sizes="(min-width: 768px) 40vw, 100vw" className="absolute inset-0" />
            <a href={credit.href} target="_blank" rel="noopener noreferrer" className="absolute bottom-2 right-3 rounded-xs bg-black/45 px-1.5 py-0.5 text-[0.65rem] text-white/90 hover:text-white">
              Photo {credit.label}
              <span className="sr-only"> (source, nouvel onglet)</span>
            </a>
          </div>
          <div className="p-6">
            <h3 className="text-lg font-semibold">Aucun appel d’outil sur cette instance</h3>
            <p className="mt-2 text-sm text-ink-2">
              Ce journal se remplit quand un agent appelle les outils MCP de l’API (<code className="ident text-xs">POST /mcp</code>). Il est tenu en mémoire par l’instance AWS Lambda qui répond : il repart de zéro à chaque démarrage et peut différer d’une actualisation à l’autre si plusieurs instances tournent.
            </p>
            <p className="mt-2 text-sm text-ink-2">
              Les questions posées au copilote n’y figurent pas : leur décision de politique est renvoyée dans chaque réponse et listée dans l’onglet « Copilote, cet onglet ».
            </p>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="Aucun appel ne correspond aux filtres">Choisissez « Toutes » ou « Tous » pour revoir l’ensemble du journal.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Appels d’outils enregistrés par la passerelle, du plus récent au plus ancien</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-3">
                <th scope="col" className="py-2.5 pl-5 pr-3 font-medium">Horodatage</th>
                <th scope="col" className="px-3 font-medium">Outil</th>
                <th scope="col" className="px-3 font-medium">Décision</th>
                <th scope="col" className="px-3 font-medium">Motif</th>
                <th scope="col" className="px-3 font-medium">Appelant</th>
                <th scope="col" className="px-3 pr-5 font-medium">Moteur</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const subset = r.engine.subset;
                const unit = r.engine.unit;
                return (
                  <tr key={`${r.at}-${i}`} className="border-b border-line last:border-b-0">
                    <td className="readout whitespace-nowrap py-2.5 pl-5 pr-3 text-xs text-ink-2">
                      <time dateTime={r.at}>{formatDateTime(r.at)}</time>
                    </td>
                    <td className="ident px-3 text-ink">{r.tool}</td>
                    <td className="px-3"><DecisionBadge decision={r.decision} /></td>
                    <td className="max-w-72 px-3 text-ink-2">{policyReason(r.reason)}</td>
                    <td className="ident px-3 text-xs text-ink-2">{r.caller}</td>
                    <td className="px-3 pr-5">
                      {subset && unit ? (
                        <Link to={`/engines/${subset}/${unit}`} className="inline-flex items-center gap-1.5 text-policy hover:underline">
                          <FleetTag subset={subset} />
                          <span className="ident">{unitLabel(unit)}</span>
                        </Link>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SessionLog() {
  const entries = useCopilotEntries();
  const rows = entries.filter((e): e is AnswerEntry | ErrorEntry => e.kind !== "question").slice().reverse();
  if (!rows.length) {
    return (
      <EmptyState
        title="Aucune question posée dans cet onglet"
        action={
          <Button asChild size="sm" variant="primary">
            <Link to="/copilot">Ouvrir le copilote</Link>
          </Button>
        }
      >
        Chaque réponse du copilote apporte la décision de la politique, le modèle utilisé et un éventuel mode de repli. Elles sont listées ici, avec les erreurs, tant que l’onglet reste ouvert.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          {rows.length} échange(s) conservé(s) dans cet onglet uniquement (stockage de session du navigateur).
        </p>
        <Button size="sm" variant="ghost" onClick={() => copilotStore.clear()}>
          <Eraser aria-hidden="true" />
          Effacer l’historique de l’onglet
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[860px] text-sm">
          <caption className="sr-only">Décisions et erreurs du copilote dans cet onglet</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-3">
              <th scope="col" className="py-2.5 pl-5 pr-3 font-medium">Heure</th>
              <th scope="col" className="px-3 font-medium">Moteur</th>
              <th scope="col" className="px-3 font-medium">Question</th>
              <th scope="col" className="px-3 font-medium">Action évaluée</th>
              <th scope="col" className="px-3 font-medium">Décision</th>
              <th scope="col" className="px-3 font-medium">Modèle</th>
              <th scope="col" className="px-3 pr-5 text-right font-medium">Latence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-b border-line align-top last:border-b-0">
                <td className="readout whitespace-nowrap py-2.5 pl-5 pr-3 text-xs text-ink-2">{formatDateTime(e.at)}</td>
                <td className="px-3 py-2.5">
                  <Link to={`/copilot?fleet=${e.subset}&engine=${e.unit}`} className="inline-flex items-center gap-1.5 text-policy hover:underline">
                    <FleetTag subset={e.subset} />
                    <span className="ident">{unitLabel(e.unit)}</span>
                  </Link>
                </td>
                <td className="max-w-64 px-3 py-2.5 text-ink-2">
                  <span className="line-clamp-2">{e.question}</span>
                </td>
                {e.kind === "answer" ? (
                  <>
                    <td className="px-3 py-2.5 text-ink-2">{actionLabel(e.response.policy.action)}</td>
                    <td className="px-3 py-2.5">
                      <DecisionBadge decision={e.response.policy.decision} />
                      {e.response.requires_approval && e.response.policy.decision !== "require_approval" && (
                        <span className="mt-1 block text-xs text-caution">Validation humaine requise</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="ident text-xs text-ink-2">{e.response.usage.model ?? "—"}</span>
                      {e.response.fallback_reason && <Badge tone="caution" className="mt-1">Repli : {e.response.fallback_reason}</Badge>}
                    </td>
                    <td className="readout px-3 py-2.5 pr-5 text-right text-xs text-ink-2">{milliseconds(e.response.usage.latency_ms ?? e.clientMs)}</td>
                  </>
                ) : (
                  <td colSpan={4} className="px-3 py-2.5 pr-5">
                    <Badge tone={e.status === null ? "neutral" : "warn"}>{e.status === null ? "Annulée ou réseau" : `Erreur HTTP ${e.status}`}</Badge>
                    <span className="ml-2 text-xs text-ink-2">{e.message}</span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AuditPage() {
  useDocumentTitle("Traçabilité");
  return (
    <div className="space-y-6">
      <header className="max-w-[70ch]">
        <h1 className="text-2xl font-semibold sm:text-3xl">Traçabilité</h1>
        <p className="mt-1 text-ink-2">
          Ce que l’API a réellement enregistré : appels d’outils filtrés par la politique de sécurité, et décisions renvoyées au copilote. Ce n’est pas un registre de conformité durable.
        </p>
      </header>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Tabs.Root defaultValue="gateway" className="min-w-0">
          <Tabs.List aria-label="Sources de traçabilité" className="mb-4 inline-flex rounded-md border border-line bg-surface-2 p-1">
            <Tabs.Trigger value="gateway" className="rounded-sm px-3 py-1.5 text-sm text-ink-2 data-[state=active]:bg-surface data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=active]:shadow-[0_0_0_1px_var(--line-strong)]">
              Passerelle d’outils (API)
            </Tabs.Trigger>
            <Tabs.Trigger value="session" className="rounded-sm px-3 py-1.5 text-sm text-ink-2 data-[state=active]:bg-surface data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=active]:shadow-[0_0_0_1px_var(--line-strong)]">
              Copilote, cet onglet
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="gateway" className="outline-none">
            <GatewayLog />
          </Tabs.Content>
          <Tabs.Content value="session" className="outline-none">
            <SessionLog />
          </Tabs.Content>
        </Tabs.Root>

        <aside aria-labelledby="read-title" className="h-fit rounded-lg border border-line bg-surface p-5">
          <h2 id="read-title" className="text-sm font-semibold">Lire une décision</h2>
          <dl className="mt-3 space-y-3 text-sm">
            {Object.entries(DECISION_META).map(([key, meta]) => (
              <div key={key}>
                <dt>
                  <DecisionBadge decision={key} />
                </dt>
                <dd className="mt-1 text-ink-2">{meta.description}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 border-t border-line pt-3 text-xs text-ink-3">
            Une action inconnue de la politique est refusée par défaut. L’immobilisation d’un moteur est toujours réservée au personnel certifié.
          </p>
        </aside>
      </div>
    </div>
  );
}
