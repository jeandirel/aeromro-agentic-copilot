import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Provenance = "observed" | "predicted" | "policy";

export const PROVENANCE: Record<Provenance, { label: string; text: string; swatch: string; description: string }> = {
  observed: {
    label: "Observé",
    text: "text-ink",
    swatch: "bg-ink",
    description: "Mesuré ou compté dans les données du moteur.",
  },
  predicted: {
    label: "Prédit",
    text: "text-predicted",
    swatch: "bg-predicted",
    description: "Calculé par le modèle RUL : estimation, intervalle et confiance.",
  },
  policy: {
    label: "Recommandation",
    text: "text-policy",
    swatch: "bg-policy",
    description: "Statut de maintenance et décisions de la politique de sécurité.",
  },
};

export function ProvenanceKey({ kinds = ["observed", "predicted", "policy"], className }: { kinds?: Provenance[]; className?: string }) {
  return (
    <ul aria-label="Légende de provenance des valeurs" className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2", className)}>
      {kinds.map((k) => (
        <li key={k} className="inline-flex items-center gap-1.5" title={PROVENANCE[k].description}>
          <span aria-hidden="true" className={cn("size-2 rounded-[1px]", PROVENANCE[k].swatch)} />
          {PROVENANCE[k].label}
        </li>
      ))}
    </ul>
  );
}

export function Readout({
  label,
  value,
  unit,
  provenance,
  hint,
  className,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  provenance: Provenance;
  hint?: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const p = PROVENANCE[provenance];
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="flex items-center gap-1.5 text-xs text-ink-2">
        <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-[1px]", p.swatch)} />
        <span className="truncate">{label}</span>
        <span className="sr-only">({p.label})</span>
      </dt>
      <dd className="mt-1">
        <span className={cn("readout", p.text, size === "lg" ? "text-3xl" : size === "md" ? "text-xl" : "text-base")}>{value}</span>
        {unit && <span className="ml-1 text-sm text-ink-3">{unit}</span>}
        {hint && <span className="mt-0.5 block text-xs text-ink-3">{hint}</span>}
      </dd>
    </div>
  );
}
