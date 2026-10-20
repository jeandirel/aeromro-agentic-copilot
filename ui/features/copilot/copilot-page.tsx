import { CircleStop, Eraser, History, SendHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { ApiError } from "@/lib/api/client";
import { useAsk, useEngines, useFleets } from "@/lib/api/queries";
import { askRequestSchema, FLEET_IDS, fleetIdSchema, type FleetId } from "@/lib/api/schemas";
import { conversationsOf, copilotStore, useCopilotEntries, type CopilotEntry } from "@/lib/copilot-store";
import { sortEngines, STATUS_META } from "@/lib/domain";
import { cycles, int, timeAgo, unitLabel } from "@/lib/format";
import { useDocumentTitle, useMediaQuery, useNow } from "@/lib/hooks";
import { cn, niceMax } from "@/lib/utils";
import { RulTape } from "@/components/instruments/rul-tape";
import { FleetTag, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Photo, photoCredit } from "@/components/ui/photo";
import { Kbd, SelectField, Skeleton } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { AnswerCard, ErrorCard } from "./answer-card";
import { suggestionsFor } from "./suggestions";

const MAX_CHARS = 500;

/** Monotonic clock for response timing (kept outside components: it is not render data). */
const clock = () => performance.now();

function useCopilotContext() {
  const [params, setParams] = useSearchParams();
  const fleetParam = params.get("fleet");
  const fleet: FleetId = fleetIdSchema.safeParse(fleetParam).success ? (fleetParam as FleetId) : "FD001";
  const engineParam = params.get("engine");
  const engine = engineParam && /^[1-9][0-9]{0,3}$/.test(engineParam) ? Number(engineParam) : null;
  const set = (next: { fleet: FleetId; engine: number | null }) => {
    const p = new URLSearchParams();
    p.set("fleet", next.fleet);
    if (next.engine) p.set("engine", String(next.engine));
    setParams(p, { replace: true });
  };
  return { fleet, engine, set };
}

function Pending({ startedAt, onCancel }: { startedAt: number; onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setElapsed(Math.round((clock() - startedAt) / 1000)), 500);
    return () => window.clearInterval(id);
  }, [startedAt]);
  return (
    <div className="rounded-lg border border-line bg-surface p-4 sm:p-5" aria-live="off">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2.5 text-sm text-ink">
          <span aria-hidden="true" className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 animate-pulse-soft rounded-full bg-policy" style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </span>
          Analyse par l’API AWS en cours
          <span className="readout text-ink-3">{elapsed} s</span>
        </p>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <CircleStop aria-hidden="true" />
          Annuler
        </Button>
      </div>
      <div className="mt-4 space-y-2" aria-hidden="true">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  );
}

export default function CopilotPage() {
  useDocumentTitle("Copilote");
  const ctx = useCopilotContext();
  const fleets = useFleets();
  const list = useEngines(ctx.fleet);
  const entries = useCopilotEntries();
  const ask = useAsk();
  const now = useNow();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  const engines = useMemo(() => (list.data ? sortEngines(list.data.engines, "priority") : []), [list.data]);
  const unit = ctx.engine ?? engines[0]?.unit ?? null;
  const engine = engines.find((e) => e.unit === unit);
  const engineKnown = !list.data || Boolean(engine);
  const max = useMemo(() => niceMax(Math.max(150, ...engines.map((e) => e.rul))), [engines]);
  const available = fleets.data?.map((f) => f.subset as FleetId) ?? [...FLEET_IDS];

  const thread = useMemo(() => entries.filter((e) => e.subset === ctx.fleet && e.unit === unit), [entries, ctx.fleet, unit]);
  const conversations = useMemo(() => conversationsOf(entries), [entries]);

  const [draft, setDraft] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ startedAt: number; key: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const controller = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep the URL explicit once the default engine is known, so the context can be shared.
  useEffect(() => {
    if (ctx.engine === null && engines[0]) ctx.set({ fleet: ctx.fleet, engine: engines[0].unit });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.engine, engines]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "end" });
  }, [thread.length, pending, reducedMotion]);

  useEffect(() => () => controller.current?.abort(), []);

  async function send(raw: string) {
    if (pending || unit === null) return;
    const parsed = askRequestSchema.safeParse({ subset: ctx.fleet, unit, question: raw });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Question invalide.");
      inputRef.current?.focus();
      return;
    }
    setFormError(null);
    const { subset, question } = parsed.data;
    const questionId = copilotStore.addQuestion(subset, unit, question);
    setDraft("");
    const abort = new AbortController();
    controller.current = abort;
    const startedAt = clock();
    setPending({ startedAt, key: `${subset}:${unit}` });
    setAnnouncement("Question envoyée, analyse en cours.");
    try {
      const response = await ask.mutateAsync({ request: parsed.data, signal: abort.signal });
      copilotStore.addAnswer(questionId, subset, unit, question, response, Math.round(clock() - startedAt));
      setAnnouncement(
        response.requires_approval ? "Réponse reçue. Validation humaine requise avant toute action." : "Réponse reçue.",
      );
    } catch (error) {
      const api = error instanceof ApiError ? error : null;
      const cancelled = api?.kind === "aborted";
      const message = cancelled
        ? "Question annulée avant la réponse. Le traitement a pu se poursuivre côté serveur."
        : api?.status === 429 && api.retryAfter
          ? `${api.message}`
          : (api?.message ?? "Erreur inattendue.");
      copilotStore.addError(questionId, subset, unit, question, {
        message,
        status: api?.status ?? null,
        detail: api?.detail ?? null,
        requestId: api?.requestId ?? null,
      });
      setAnnouncement(cancelled ? "Question annulée." : `Échec : ${message}`);
    } finally {
      controller.current = null;
      setPending(null);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  }

  const suggestions = suggestionsFor(engine?.status);
  const busyHere = pending?.key === `${ctx.fleet}:${unit}`;
  const credit = photoCredit("engine-test-control");

  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start xl:grid-cols-[22rem_minmax(0,1fr)] xl:gap-6">
      {/* Context */}
      <aside aria-label="Contexte de l’analyse" className="space-y-4 lg:sticky lg:top-24">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Copilote</h1>
          <p className="mt-1 text-sm text-ink-2">Questions en langage naturel sur un moteur, réponses de l’API AWS fondées sur les faits du modèle RUL et soumises à la politique de sécurité.</p>
        </div>
        <section aria-labelledby="ctx-title" className="rounded-lg border border-line bg-surface p-4">
          <h2 id="ctx-title" className="text-sm font-semibold">Moteur analysé</h2>
          <div className="mt-3 grid grid-cols-[6.5rem_1fr] gap-2">
            <SelectField
              label="Flotte"
              id="ctx-fleet"
              value={ctx.fleet}
              onChange={(e) => ctx.set({ fleet: e.target.value as FleetId, engine: null })}
            >
              {available.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Moteur"
              id="ctx-engine"
              value={unit ?? ""}
              disabled={!engines.length}
              onChange={(e) => ctx.set({ fleet: ctx.fleet, engine: Number(e.target.value) })}
            >
              {!engines.length && <option value="">Chargement…</option>}
              {engines.map((e) => (
                <option key={e.unit} value={e.unit}>
                  {unitLabel(e.unit)} (RUL {cycles(e.rul)}, {STATUS_META[e.status].short.toLowerCase()})
                </option>
              ))}
            </SelectField>
          </div>
          {list.error ? (
            <ErrorState className="mt-3" compact error={list.error} title="Moteurs indisponibles" onRetry={() => void list.refetch()} />
          ) : engine && list.data ? (
            <div className="mt-4 border-t border-line pt-4">
              <div className="flex items-center justify-between gap-2">
                <StatusBadge status={engine.status} />
                <Link to={`/engines/${engine.subset}/${engine.unit}`} className="text-xs text-policy hover:underline">
                  Ouvrir le diagnostic
                </Link>
              </div>
              <RulTape className="mt-2" size="md" rul={engine.rul} low={engine.rul_low} high={engine.rul_high} thresholds={list.data.thresholds} max={max} />
              <p className="mt-1 text-xs text-ink-2">
                <span className="readout text-predicted">{cycles(engine.rul)}</span> cycles restants estimés,{" "}
                <span className="readout text-ink">{int(engine.cycles_flown)}</span> cycles parcourus.
              </p>
            </div>
          ) : !engineKnown ? (
            <p className="mt-3 text-sm text-warn">Ce moteur n’existe pas dans {ctx.fleet}. Choisissez-en un dans la liste.</p>
          ) : (
            <Skeleton className="mt-4 h-16 w-full" />
          )}
        </section>

        <section aria-labelledby="history-title" className="rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 id="history-title" className="flex items-center gap-2 text-sm font-semibold">
              <History aria-hidden="true" className="size-4 text-ink-3" />
              Historique de l’onglet
            </h2>
            {conversations.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => copilotStore.clear()} disabled={Boolean(pending)}>
                <Eraser aria-hidden="true" />
                Effacer
              </Button>
            )}
          </div>
          {conversations.length === 0 ? (
            <p className="mt-2 text-xs text-ink-3">Les échanges restent dans cet onglet : rien n’est enregistré côté serveur.</p>
          ) : (
            <ul className="mt-2 max-h-64 space-y-0.5 overflow-auto scrollbar-thin">
              {conversations.map((c) => {
                const active = c.subset === ctx.fleet && c.unit === unit;
                return (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={() => ctx.set({ fleet: c.subset, engine: c.unit })}
                      aria-current={active ? "true" : undefined}
                      className={cn("w-full rounded-sm px-2 py-1.5 text-left", active ? "bg-policy-soft" : "hover:bg-sunken/60")}
                    >
                      <span className="flex items-center gap-1.5">
                        <FleetTag subset={c.subset} />
                        <span className="ident text-sm">{unitLabel(c.unit)}</span>
                        <span className="ml-auto text-2xs text-ink-3">{timeAgo(c.lastAt, now)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-2">{c.lastQuestion}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </aside>

      {/* Conversation */}
      <section aria-label="Conversation" className="flex min-w-0 flex-col rounded-lg border border-line bg-surface-2/50 lg:h-[calc(100dvh-8.5rem)]">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-5">
          <p className="flex items-center gap-2 text-sm">
            <FleetTag subset={ctx.fleet} />
            <span className="font-semibold">Moteur {unit ? unitLabel(unit) : "…"}</span>
          </p>
          <p className="text-xs text-ink-3">{thread.filter((e) => e.kind === "question").length} question(s)</p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin sm:p-5" role="log" aria-label="Échanges avec le copilote" aria-live="off">
          {thread.length === 0 && !busyHere && (
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              <div className="relative">
                <Photo
                  slug="engine-test-control"
                  alt="Salle de contrôle du laboratoire d’essais moteurs de la NASA Glenn, ingénieurs à leurs consoles."
                  sizes="(min-width: 1024px) 60vw, 100vw"
                  className="aspect-[21/8] w-full"
                  position="50% 35%"
                />
                <a href={credit.href} target="_blank" rel="noopener noreferrer" className="absolute bottom-2 right-3 rounded-xs bg-black/45 px-1.5 py-0.5 text-[0.65rem] text-white/90 hover:text-white">
                  Photo {credit.label}
                  <span className="sr-only"> (source, nouvel onglet)</span>
                </a>
              </div>
              <div className="p-5">
                <h2 className="text-lg font-semibold">Que voulez-vous savoir sur ce moteur ?</h2>
                <p className="mt-1 max-w-[62ch] text-sm text-ink-2">
                  Chaque réponse sépare les faits calculés par le modèle RUL, la décision de la politique de sécurité et l’explication rédigée par le modèle de langage. Elle ne vaut jamais certification de navigabilité.
                </p>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {suggestions.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        disabled={!engine || Boolean(pending)}
                        onClick={() => void send(s)}
                        className="h-full w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-left text-sm text-ink transition-colors hover:border-policy hover:bg-policy-soft disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {thread.map((entry: CopilotEntry) => {
            if (entry.kind === "question") {
              return (
                <div key={entry.id} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-line rounded-lg rounded-br-xs bg-ink px-4 py-2.5 text-[0.95rem] text-canvas">
                    <span className="sr-only">Votre question : </span>
                    {entry.question}
                  </p>
                </div>
              );
            }
            if (entry.kind === "answer") return <AnswerCard key={entry.id} entry={entry} thresholds={list.data?.thresholds} max={max} />;
            return <ErrorCard key={entry.id} entry={entry} disabled={Boolean(pending)} onRetry={() => void send(entry.question)} />;
          })}
          {busyHere && pending && <Pending startedAt={pending.startedAt} onCancel={() => controller.current?.abort()} />}
          <div ref={endRef} />
        </div>

        <form onSubmit={onSubmit} className="sticky bottom-16 border-t border-line bg-surface p-3 sm:p-4 lg:static" aria-label="Poser une question">
          {thread.length > 0 && !pending && (
            <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-thin">
              {suggestions.slice(0, 3).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  disabled={!engine}
                  className="shrink-0 rounded-full border border-line-strong px-3 py-1 text-xs text-ink-2 hover:border-policy hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <label htmlFor="question" className="sr-only">
            Votre question sur {ctx.fleet}, moteur {unit ? unitLabel(unit) : ""}
          </label>
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              id="question"
              rows={2}
              maxLength={MAX_CHARS}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (formError) setFormError(null);
              }}
              onKeyDown={onKeyDown}
              placeholder={`Votre question sur le moteur ${unit ? unitLabel(unit) : ""} de ${ctx.fleet}`}
              aria-describedby="question-help"
              aria-invalid={formError ? true : undefined}
              disabled={!engine}
              className="max-h-40 min-h-[3rem] flex-1 resize-none rounded-md border border-control/70 bg-surface px-3 py-2.5 text-[0.95rem] text-ink placeholder:text-ink-3 hover:border-ink-2 disabled:opacity-60 [field-sizing:content]"
            />
            {pending ? (
              <Button type="button" variant="secondary" className="h-12" aria-label="Annuler la question" onClick={() => controller.current?.abort()}>
                <CircleStop aria-hidden="true" />
                <span className="hidden sm:inline">Annuler</span>
              </Button>
            ) : (
              <Button type="submit" variant="primary" className="h-12" aria-label="Envoyer la question" disabled={!engine || draft.trim().length < 3}>
                <SendHorizontal aria-hidden="true" />
                <span className="hidden sm:inline">Envoyer</span>
              </Button>
            )}
          </div>
          <div id="question-help" className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-ink-3">
            {formError ? (
              <span className="text-warn" role="alert">
                {formError}
              </span>
            ) : (
              <span>
                Chaque question est traitée indépendamment, sans mémoire des précédentes. <Kbd>Entrée</Kbd> pour envoyer, <Kbd>Maj</Kbd> + <Kbd>Entrée</Kbd> pour aller à la ligne.
              </span>
            )}
            <span className="readout">
              {draft.length}/{MAX_CHARS}
            </span>
          </div>
        </form>
      </section>
      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>
    </div>
  );
}
