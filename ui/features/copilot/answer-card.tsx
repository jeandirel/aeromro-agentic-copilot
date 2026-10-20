import { AlertTriangle, Check, Copy, RotateCcw, ShieldAlert, ShieldCheck, UserCheck } from "lucide-react";
import { useState } from "react";
import type { Thresholds } from "@/lib/api/schemas";
import type { AnswerEntry, ErrorEntry } from "@/lib/copilot-store";
import { actionLabel, decisionMeta, policyReason, STATUS_META } from "@/lib/domain";
import { cycles, decimal2, formatTime, int, interval, milliseconds, percent, unitLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Readout } from "@/components/instruments/provenance";
import { RulTape } from "@/components/instruments/rul-tape";
import { DecisionBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GeneratedText, stripMarks } from "@/components/ui/generated-text";
import { Tip } from "@/components/ui/primitives";

const FACTS_ONLY_PREFIX = "[summary without language model]";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tip content={copied ? "Copié" : "Copier l’explication générée"}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={copied ? "Explication copiée" : "Copier l’explication générée"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </Button>
    </Tip>
  );
}

/**
 * One answer from POST /ask, in three clearly separated layers, read in the order a person needs:
 * 1. the language model's explanation (the answer to the question), labelled as generated and fallible,
 * 2. the policy decision of the harness (with a banner on top when human approval is required),
 * 3. the structured facts from the RUL model it rests on (trusted numbers, not generated text).
 */
export function AnswerCard({ entry, thresholds, max }: { entry: AnswerEntry; thresholds: Thresholds | undefined; max: number }) {
  const { response } = entry;
  const e = response.engine;
  const decision = decisionMeta(response.policy.decision);
  const factsOnly = response.answer.trimStart().startsWith(FACTS_ONLY_PREFIX) || response.usage.model === "facts-summary";
  const answerText = response.answer.replace(FACTS_ONLY_PREFIX, "").trim();
  const mismatch = e.subset !== entry.subset || e.unit !== entry.unit;
  const DecisionIcon = response.requires_approval ? UserCheck : response.policy.decision === "deny" ? ShieldAlert : ShieldCheck;

  return (
    <article aria-label={`Réponse du copilote pour ${entry.subset}, moteur ${unitLabel(entry.unit)}`} className="rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-semibold text-ink">Copilote AeroMRO</span>
          <span className="ident truncate rounded-xs bg-sunken px-1.5 py-0.5 text-[0.7rem] text-ink-2" title="Modèle déclaré par l’API">
            {response.usage.model ?? "modèle non communiqué"}
          </span>
        </div>
        <span className="flex gap-3 text-xs text-ink-3">
          <time dateTime={new Date(entry.at).toISOString()}>{formatTime(entry.at)}</time>
          <span title="Latence du modèle déclarée par l’API">{milliseconds(response.usage.latency_ms ?? entry.clientMs)}</span>
        </span>
      </header>

      {response.fallback_reason && (
        <div role="note" className="flex gap-2.5 border-b border-line bg-caution-soft px-4 py-3 text-sm sm:px-5">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-caution" />
          <p className="text-ink">
            <span className="font-semibold">Mode de repli.</span> Le modèle de langage n’a pas répondu, raison déclarée par l’API :{" "}
            <span className="ident break-all text-xs">{response.fallback_reason}</span>. L’explication ci-dessous est un résumé automatique des faits, produit sans modèle de langage.
          </p>
        </div>
      )}

      {mismatch && (
        <div role="alert" className="border-b border-line bg-warn-soft px-4 py-3 text-sm text-warn sm:px-5">
          Incohérence : la réponse concerne {e.subset}, moteur {unitLabel(e.unit)}, et non le moteur demandé. Ne l’utilisez pas.
        </div>
      )}

      {response.requires_approval && (
        <div className="flex items-center gap-2.5 border-b border-line bg-caution-soft px-4 py-2.5 text-sm font-semibold text-ink sm:px-5">
          <UserCheck aria-hidden="true" className="size-4 shrink-0 text-caution" />
          Validation humaine requise avant toute action.
        </div>
      )}

      {/* 1. The answer to the question, first */}
      <section aria-label="Explication générée" className="border-b border-line px-4 py-4 sm:px-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">{factsOnly ? "Résumé automatique des faits" : "Explication générée"}</h3>
          <CopyButton text={stripMarks(answerText)} />
        </div>
        <GeneratedText text={answerText} className="mt-2 max-w-[72ch] space-y-2 text-[0.95rem] leading-relaxed text-ink" />
        <p className="mt-3 text-xs text-ink-3">
          {factsOnly
            ? "Texte assemblé par l’API à partir des faits ci-dessus, sans modèle de langage."
            : "Texte produit par un modèle de langage à partir des faits ci-dessus : il peut contenir des erreurs d’interprétation, surtout près des seuils."}{" "}
          Ne constitue pas une certification de navigabilité.
        </p>
      </section>

      {/* 2. Policy decision */}
      <section aria-label="Décision de la politique" className={cn("border-b border-line px-4 py-4 sm:px-5", response.requires_approval && "bg-caution-soft/50")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Décision de la politique de sécurité</h3>
          <DecisionBadge decision={response.policy.decision} />
        </div>
        <div className="mt-2 flex gap-2.5">
          <DecisionIcon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", response.requires_approval ? "text-caution" : "text-policy")} />
          <div className="text-sm">
            <p className="text-ink">
              {response.requires_approval ? (
                <strong className="font-semibold">Validation humaine requise : un ingénieur de maintenance doit examiner cette recommandation avant toute action.</strong>
              ) : (
                decision.description
              )}
            </p>
            <p className="mt-1 text-ink-2">
              Action évaluée : {actionLabel(response.policy.action)}. Motif : {policyReason(response.policy.reason)}
            </p>
          </div>
        </div>
      </section>

      {/* 3. Structured facts the answer rests on */}
      <section aria-label="Faits du modèle RUL" className="bg-surface-2/60 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Faits du modèle RUL</h3>
          <span className="text-xs text-ink-3">Valeurs structurées de l’API, non générées</span>
        </div>
        {thresholds && <RulTape className="mt-2" size="md" rul={e.rul} low={e.rul_low} high={e.rul_high} thresholds={thresholds} max={max} />}
        <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
          <Readout size="sm" label="Cycles parcourus" value={int(e.cycles_flown)} provenance="observed" hint="Déjà effectués" />
          <Readout size="sm" label="Cycles restants (RUL)" value={cycles(e.rul)} provenance="predicted" hint="Estimation" />
          <Readout size="sm" label="Intervalle à 80 %" value={interval(e.rul_low, e.rul_high)} provenance="predicted" />
          <Readout size="sm" label="Confiance du statut" value={percent(e.confidence)} provenance="predicted" />
        </dl>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-2">
          <StatusBadge status={e.status} short={false} />
          <span>{STATUS_META[e.status].action}. Statut calculé sur les cycles restants, pas sur les cycles parcourus.</span>
        </div>
      </section>

      <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-xs text-ink-3 sm:px-5">
        <span>
          Jetons <span className="readout text-ink-2">{int(response.usage.input_tokens)}</span> en entrée,{" "}
          <span className="readout text-ink-2">{int(response.usage.output_tokens)}</span> en sortie
        </span>
        {response.usage.cost !== null && (
          <span>
            Coût estimé <span className="readout text-ink-2">{decimal2(response.usage.cost)}</span>
          </span>
        )}
        <span>Aller-retour navigateur {milliseconds(entry.clientMs)}</span>
      </footer>
    </article>
  );
}

export function ErrorCard({ entry, onRetry, disabled }: { entry: ErrorEntry; onRetry: () => void; disabled: boolean }) {
  const cancelled = entry.status === null && entry.message.startsWith("Question annulée");
  return (
    <article role="alert" className={cn("rounded-lg border p-4 sm:p-5", cancelled ? "border-line bg-surface" : "border-warn/40 bg-warn-soft/50")}>
      <div className="flex gap-2.5">
        <AlertTriangle aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", cancelled ? "text-ink-3" : "text-warn")} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{cancelled ? "Question annulée" : "Aucune réponse du copilote"}</p>
          <p className="mt-0.5 text-sm text-ink-2">{entry.message}</p>
          {(entry.status !== null || entry.detail) && (
            <p className="readout mt-1 break-words text-xs text-ink-3">
              {entry.status !== null ? `HTTP ${entry.status}` : ""}
              {entry.detail ? ` — ${entry.detail}` : ""}
            </p>
          )}
          <p className="mt-1 text-xs text-ink-3">Aucune réponse n’a été générée ni simulée par l’interface.</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={onRetry} disabled={disabled}>
            <RotateCcw aria-hidden="true" />
            Reposer la question
          </Button>
        </div>
      </div>
    </article>
  );
}
