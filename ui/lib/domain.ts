/**
 * Vocabulary of the maintenance domain, in French, kept in one place so the same words are used on
 * every screen. Values not listed here are shown as returned by the API rather than guessed.
 */
import type { Engine, EngineStatus, FleetId, Thresholds } from "./api/schemas";

export type Tone = "warn" | "caution" | "normal" | "policy" | "neutral";

export const STATUS_META: Record<EngineStatus, { label: string; short: string; tone: Tone; rank: number; action: string }> = {
  inspect_now: {
    label: "Inspection immédiate",
    short: "Inspection immédiate",
    tone: "warn",
    rank: 0,
    action: "Inspecter avant le prochain vol",
  },
  plan_inspection: {
    label: "Inspection à planifier",
    short: "À planifier",
    tone: "caution",
    rank: 1,
    action: "Planifier une inspection à la prochaine opportunité de maintenance",
  },
  healthy: {
    label: "Nominal, surveillance normale",
    short: "Nominal",
    tone: "normal",
    rank: 2,
    action: "Aucune action, poursuivre la surveillance",
  },
};

export function statusRule(status: EngineStatus, t: Thresholds): string {
  if (status === "inspect_now") return `RUL estimé ≤ ${t.inspect_now} cycles`;
  if (status === "plan_inspection") return `RUL estimé entre ${t.inspect_now} et ${t.plan_inspection} cycles`;
  return `RUL estimé > ${t.plan_inspection} cycles`;
}

export const DECISION_META: Record<string, { label: string; tone: Tone; description: string }> = {
  allow: {
    label: "Autorisé",
    tone: "normal",
    description: "L’action est dans le cadre de la politique. Pour une recommandation, cela autorise sa production, pas une opération sur l’avion.",
  },
  require_approval: {
    label: "Validation humaine requise",
    tone: "caution",
    description: "Un ingénieur de maintenance doit examiner la recommandation avant toute action.",
  },
  deny: {
    label: "Refusé",
    tone: "warn",
    description: "Action réservée au personnel de maintenance certifié ou inconnue de la politique (refus par défaut).",
  },
};

export function decisionMeta(decision: string) {
  return DECISION_META[decision] ?? { label: decision, tone: "neutral" as Tone, description: "Décision non documentée par l’interface." };
}

export const ACTION_LABELS: Record<string, string> = {
  estimate_rul: "Estimation du RUL",
  recommend_inspection: "Recommandation d’inspection",
  read_engine_telemetry: "Lecture de la télémétrie moteur",
  search_regulations: "Recherche réglementaire",
  draft_work_order: "Brouillon d’ordre de travail",
  ground_engine: "Immobilisation du moteur",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** Translates the policy reasons produced by src/aeromro/harness/policy.py; unknown reasons stay verbatim. */
export function policyReason(reason: string): string {
  if (reason === "within policy") return "Dans le cadre de la politique.";
  if (reason === "reserved to certified maintenance staff") return "Réservé au personnel de maintenance certifié.";
  if (reason === "unknown action (fail closed)") return "Action inconnue : refus par défaut.";
  if (reason === "side effect outside the agent: human approval required") return "Effet hors de l’agent : approbation humaine requise.";
  const low = /^confidence below ([0-9.]+): human review required$/.exec(reason);
  if (low) return `Confiance inférieure à ${Number(low[1]).toLocaleString("fr-FR")} : revue humaine requise.`;
  return reason;
}

export const FLEET_META: Record<FleetId, { name: string }> = {
  FD001: { name: "Flotte FD001" },
  FD002: { name: "Flotte FD002" },
  FD003: { name: "Flotte FD003" },
  FD004: { name: "Flotte FD004" },
};

const FAULT_MODES: Record<string, string> = {
  "HPC degradation": "compresseur HP",
  "fan degradation": "soufflante",
};

export function faultModes(modes: string[]): string {
  return modes.map((m) => FAULT_MODES[m] ?? m).join(" et ");
}

export function conditionsLabel(conditions: number): string {
  return conditions === 1 ? "1 régime de vol" : `${conditions} régimes de vol`;
}

/** Sensor names after Saxena et al. (2008), table 2. The API label is the fallback. */
const SENSOR_FR: Record<string, { code: string; name: string }> = {
  sensor_1: { code: "T2", name: "Température totale entrée soufflante" },
  sensor_2: { code: "T24", name: "Température totale sortie LPC" },
  sensor_3: { code: "T30", name: "Température totale sortie HPC" },
  sensor_4: { code: "T50", name: "Température totale sortie LPT" },
  sensor_5: { code: "P2", name: "Pression entrée soufflante" },
  sensor_6: { code: "P15", name: "Pression totale conduit secondaire" },
  sensor_7: { code: "P30", name: "Pression totale sortie HPC" },
  sensor_8: { code: "Nf", name: "Vitesse physique soufflante" },
  sensor_9: { code: "Nc", name: "Vitesse physique du corps" },
  sensor_10: { code: "epr", name: "Rapport de pression moteur" },
  sensor_11: { code: "Ps30", name: "Pression statique sortie HPC" },
  sensor_12: { code: "phi", name: "Rapport débit carburant / Ps30" },
  sensor_13: { code: "NRf", name: "Vitesse soufflante corrigée" },
  sensor_14: { code: "NRc", name: "Vitesse du corps corrigée" },
  sensor_15: { code: "BPR", name: "Taux de dilution" },
  sensor_16: { code: "farB", name: "Rapport carburant / air brûleur" },
  sensor_17: { code: "htBleed", name: "Enthalpie de prélèvement" },
  sensor_18: { code: "Nf_dmd", name: "Vitesse soufflante demandée" },
  sensor_19: { code: "PCNfR_dmd", name: "Vitesse soufflante corrigée demandée" },
  sensor_20: { code: "W31", name: "Prélèvement refroidissement HPT" },
  sensor_21: { code: "W32", name: "Prélèvement refroidissement LPT" },
};

export function sensorLabel(key: string, apiLabel?: string): { code: string; name: string } {
  const known = SENSOR_FR[key];
  if (known) return known;
  const [code, ...rest] = (apiLabel ?? key).split(",");
  return { code: (code ?? key).trim(), name: rest.join(",").trim() || key };
}

export function compareEngines(a: Engine, b: Engine): number {
  return STATUS_META[a.status].rank - STATUS_META[b.status].rank || a.rul - b.rul || a.subset.localeCompare(b.subset) || a.unit - b.unit;
}

export type SortKey = "priority" | "rul_desc" | "cycles_desc" | "confidence_asc" | "unit_asc";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "priority", label: "Priorité (RUL croissant)" },
  { value: "rul_desc", label: "RUL décroissant" },
  { value: "cycles_desc", label: "Cycles parcourus, du plus élevé" },
  { value: "confidence_asc", label: "Confiance du statut, la plus faible" },
  { value: "unit_asc", label: "Numéro de moteur" },
];

export function sortEngines(engines: Engine[], key: SortKey): Engine[] {
  const rows = [...engines];
  switch (key) {
    case "rul_desc":
      return rows.sort((a, b) => b.rul - a.rul || a.unit - b.unit);
    case "cycles_desc":
      return rows.sort((a, b) => b.cycles_flown - a.cycles_flown || a.rul - b.rul);
    case "confidence_asc":
      return rows.sort((a, b) => a.confidence - b.confidence || a.rul - b.rul);
    case "unit_asc":
      return rows.sort((a, b) => a.subset.localeCompare(b.subset) || a.unit - b.unit);
    default:
      return rows.sort(compareEngines);
  }
}

export const DISCLAIMER =
  "Données simulées NASA C-MAPSS. Aide à la décision pour la recherche : ne constitue ni une certification de navigabilité, ni une autorisation de vol ou de maintenance.";
