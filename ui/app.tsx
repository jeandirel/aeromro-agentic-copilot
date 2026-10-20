import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Tooltip } from "radix-ui";
import { lazy, useState } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { ApiError } from "@/lib/api/client";
import { useDocumentTitle } from "@/lib/hooks";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";

const DashboardPage = lazy(() => import("@/features/dashboard/dashboard-page"));
const EnginesPage = lazy(() => import("@/features/engines/engines-page"));
const CopilotPage = lazy(() => import("@/features/copilot/copilot-page"));
const AuditPage = lazy(() => import("@/features/audit/audit-page"));

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Retry transient failures once; never retry client errors (4xx) or invalid payloads.
        retry: (count, error) => {
          if (error instanceof ApiError && (error.kind === "invalid" || (error.status !== null && error.status < 500))) return false;
          return count < 1;
        },
        refetchOnWindowFocus: false,
      },
    },
  });
}

function NotFound() {
  useDocumentTitle("Page introuvable");
  return (
    <div className="max-w-xl py-16">
      <p className="readout text-sm text-ink-3">404</p>
      <h1 className="mt-2 text-3xl font-semibold">Cette page n’existe pas</h1>
      <p className="mt-3 text-ink-2">L’adresse est peut-être incomplète. Revenez à la vue d’ensemble de la flotte pour continuer.</p>
      <Button asChild variant="primary" className="mt-6">
        <Link to="/">Ouvrir la vue d’ensemble</Link>
      </Button>
    </div>
  );
}

export function App() {
  const [client] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <Tooltip.Provider delayDuration={250} skipDelayDuration={100}>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="engines" element={<EnginesPage />} />
              <Route path="engines/:subset/:unit" element={<EnginesPage />} />
              <Route path="copilot" element={<CopilotPage />} />
              <Route path="audit" element={<AuditPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </Tooltip.Provider>
    </QueryClientProvider>
  );
}
