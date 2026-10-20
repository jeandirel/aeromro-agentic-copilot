import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, Popover } from "radix-ui";
import { Check, Monitor, Moon, RefreshCw, Sun } from "lucide-react";
import { useHealth } from "@/lib/api/queries";
import { errorMessage } from "@/lib/api/client";
import { milliseconds, timeAgo } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/primitives";

const PROVIDERS: Record<string, string> = {
  bedrock: "Amazon Bedrock",
  mock: "Hors ligne (résumé des faits, sans modèle de langage)",
};

export function SystemStatus({ compact = false }: { compact?: boolean }) {
  const health = useHealth();
  const now = useNow();
  const state = health.isPending ? "checking" : health.isError ? "down" : "up";
  const label = state === "up" ? "API opérationnelle" : state === "down" ? "API injoignable" : "Vérification de l’API";
  const dot = state === "up" ? "bg-normal-fill" : state === "down" ? "bg-warn" : "bg-ink-3 animate-pulse-soft";

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md px-2.5 text-sm text-ink-2 hover:bg-sunken/70 hover:text-ink"
          aria-label={`${label}. Afficher l’état du système`}
        >
          <span aria-hidden="true" className={cn("size-2 rounded-full", dot)} />
          {!compact && <span>{label}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-80 rounded-lg border border-line bg-surface p-4 text-sm shadow-pop"
        >
          <p className="font-semibold text-ink">État du système</p>
          {health.isError ? (
            <p className="mt-2 text-ink-2">{errorMessage(health.error)}</p>
          ) : (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="text-ink-3">API</dt>
              <dd className="text-ink">{health.data ? `FastAPI sur AWS Lambda, version ${health.data.version}` : "…"}</dd>
              <dt className="text-ink-3">Langage</dt>
              <dd className="text-ink">{health.data ? (PROVIDERS[health.data.llm_provider] ?? health.data.llm_provider) : "…"}</dd>
              <dt className="text-ink-3">Flottes</dt>
              <dd className="ident text-ink">{health.data ? health.data.subsets.join(", ") || "aucune" : "…"}</dd>
              <dt className="text-ink-3">Aller-retour</dt>
              <dd className="readout text-ink">{health.data ? milliseconds(health.data.roundTripMs) : "…"}</dd>
              <dt className="text-ink-3">Vérifié</dt>
              <dd className="text-ink">{health.data ? timeAgo(health.data.checkedAt, now) : "…"}</dd>
            </dl>
          )}
          <p className="mt-3 border-t border-line pt-3 text-xs text-ink-3">
            Chaque réponse du copilote indique le modèle utilisé et, le cas échéant, le mode de repli déclaré par l’API.
          </p>
          <Popover.Arrow className="fill-surface" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function RefreshButton() {
  const client = useQueryClient();
  const fetching = useIsFetching();
  return (
    <Tip content="Recharger les données depuis l’API">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Recharger les données"
        onClick={() => void client.invalidateQueries()}
        aria-busy={fetching > 0}
      >
        <RefreshCw aria-hidden="true" className={cn(fetching > 0 && "animate-spin [animation-duration:1.4s]")} />
      </Button>
    </Tip>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Clair (hangar)", icon: Sun },
  { value: "dark", label: "Sombre (poste de pilotage)", icon: Moon },
  { value: "system", label: "Selon le système", icon: Monitor },
];

export function ThemeMenu() {
  const { preference, resolved, setPreference } = useTheme();
  const Icon = resolved === "dark" ? Moon : Sun;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Choisir le thème d’affichage">
          <Icon aria-hidden="true" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-56 rounded-md border border-line bg-surface p-1 shadow-pop">
          <DropdownMenu.Label className="px-2 py-1.5 text-xs text-ink-3">Thème d’affichage</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={preference} onValueChange={(v) => setPreference(v as ThemePreference)}>
            {THEME_OPTIONS.map((o) => (
              <DropdownMenu.RadioItem
                key={o.value}
                value={o.value}
                className="flex cursor-default items-center gap-2 rounded-sm px-2 py-2 text-sm text-ink outline-none data-[highlighted]:bg-sunken"
              >
                <o.icon aria-hidden="true" className="size-4 text-ink-2" />
                <span className="flex-1">{o.label}</span>
                <DropdownMenu.ItemIndicator>
                  <Check aria-hidden="true" className="size-4 text-policy" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
