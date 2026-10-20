import { Dialog } from "radix-ui";
import { ExternalLink, X } from "lucide-react";
import type { ReactNode } from "react";
import { allPhotoCredits } from "@/components/ui/photo";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

/** Sources, limits and photo credits. Everything listed here is verifiable at the linked source. */
export function AboutDialog({ trigger }: { trigger: ReactNode }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgb(var(--scrim)/0.55)]" />
        <Dialog.Content className="fixed inset-x-3 bottom-3 top-auto z-50 max-h-[85dvh] overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-pop sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(640px,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-xl font-semibold text-ink">Sources et limites</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Fermer">
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-2 text-sm text-ink-2">
            AeroMRO est un prototype de recherche en aide à la décision. Il n’est pas certifié pour la maintenance aéronautique réelle.
          </Dialog.Description>

          <h3 className="mt-6 text-sm font-semibold text-ink">Données</h3>
          <p className="mt-1 text-sm text-ink-2">
            Jeu de données NASA C-MAPSS (Saxena et al., 2008) : moteurs turbofan simulés, quatre sous-ensembles FD001 à FD004. Les moteurs « en service » sont ceux du jeu de test officiel, observés jusqu’à un cycle donné.
          </p>
          <h3 className="mt-4 text-sm font-semibold text-ink">Prédictions</h3>
          <p className="mt-1 text-sm text-ink-2">
            Modèle RUL par sous-ensemble, avec un intervalle de prédiction conforme visé à 80 %. Le statut compare l’estimation aux seuils de l’API ; la confiance est la part de l’intervalle située dans la même bande de statut.
          </p>
          <h3 className="mt-4 text-sm font-semibold text-ink">Copilote</h3>
          <p className="mt-1 text-sm text-ink-2">
            Les réponses viennent de l’endpoint <code className="ident text-xs">POST /ask</code> de l’API AWS (Amazon Bedrock, ou résumé des faits sans modèle de langage en cas de repli). La politique de sécurité peut exiger une validation humaine ; aucune réponse n’autorise un vol ni une intervention.
          </p>

          <h3 className="mt-6 text-sm font-semibold text-ink">Photographies</h3>
          <p className="mt-1 text-sm text-ink-2">
            Bibliothèque d’images de la NASA, utilisées à titre d’illustration. Elles ne représentent pas les moteurs simulés et n’impliquent aucun partenariat ni soutien de la NASA.
          </p>
          <ul className="mt-2 divide-y divide-line rounded-md border border-line">
            {allPhotoCredits().map((c) => (
              <li key={c.slug} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{c.title}</span>
                  <span className="block text-xs text-ink-3">
                    {c.photographer ? `${c.photographer}, ` : ""}NASA {c.center}, {formatDate(c.dateCreated)}
                  </span>
                </span>
                <a href={c.source} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-policy hover:underline">
                  {c.nasaId}
                  <ExternalLink aria-hidden="true" className="size-3" />
                  <span className="sr-only">(nouvel onglet)</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-3">Polices : Archivo (Omnibus-Type) et B612 Mono (conçue pour les écrans de vol Airbus), licence SIL Open Font.</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
