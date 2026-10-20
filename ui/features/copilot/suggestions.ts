import type { EngineStatus } from "@/lib/api/schemas";

/**
 * Starter questions, chosen from the engine's status. They are only prompts: the answer always
 * comes from POST /ask, never from the interface.
 */
const BY_STATUS: Record<EngineStatus, string[]> = {
  inspect_now: [
    "Pourquoi faut-il inspecter ce moteur avant son prochain vol ?",
    "Que doit vérifier un ingénieur de maintenance avant toute décision sur ce moteur ?",
  ],
  plan_inspection: [
    "Quand faut-il planifier l’inspection de ce moteur ?",
    "L’intervalle de prédiction de ce moteur chevauche-t-il un seuil d’inspection ?",
  ],
  healthy: [
    "Combien de cycles reste-t-il avant le seuil de planification pour ce moteur ?",
    "Ce moteur nécessite-t-il une action de maintenance aujourd’hui ?",
  ],
};

const COMMON = [
  "Quelle est la différence entre les cycles parcourus et les cycles restants pour ce moteur ?",
  "Quelles sont les limites et l’incertitude de cette prédiction ?",
];

export function suggestionsFor(status: EngineStatus | undefined): string[] {
  return [...(status ? BY_STATUS[status] : []), ...COMMON].slice(0, 4);
}
