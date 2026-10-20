import { Fan, Gauge, Info, MessageSquareText, ScrollText, type LucideIcon } from "lucide-react";
import { Suspense, useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useHealth } from "@/lib/api/queries";
import { DISCLAIMER } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Skeleton, Tip } from "@/components/ui/primitives";
import { AboutDialog } from "./about-dialog";
import { Brand } from "./brand";
import { RefreshButton, SystemStatus, ThemeMenu } from "./system-status";

interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
  end?: boolean;
}

export const NAV: NavItem[] = [
  { to: "/", label: "Vue d’ensemble", short: "Flotte", icon: Gauge, end: true },
  { to: "/engines", label: "Santé moteur", short: "Moteurs", icon: Fan },
  { to: "/copilot", label: "Copilote", short: "Copilote", icon: MessageSquareText },
  { to: "/audit", label: "Traçabilité", short: "Traçabilité", icon: ScrollText },
];

function Sidebar() {
  const health = useHealth();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-16 items-center px-5">
        <NavLink to="/" className="rounded-md">
          <Brand />
          <span className="sr-only">, vue d’ensemble</span>
        </NavLink>
      </div>
      <nav aria-label="Navigation principale" className="mt-4 px-3">
        <ul className="space-y-0.5">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "group relative flex h-10 items-center gap-3 rounded-md px-3 text-[0.9rem] transition-colors",
                    isActive ? "bg-policy-soft font-semibold text-ink" : "text-ink-2 hover:bg-sunken/70 hover:text-ink",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span aria-hidden="true" className={cn("absolute inset-y-2 left-0 w-[3px] rounded-r-full", isActive ? "bg-policy" : "bg-transparent")} />
                    <item.icon aria-hidden="true" className={cn("size-[18px]", isActive ? "text-policy" : "text-ink-3 group-hover:text-ink-2")} />
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-auto space-y-3 p-4">
        <div className="rounded-md border border-line bg-surface-2 p-3">
          <p className="text-xs font-semibold text-ink">Aide à la décision</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">{DISCLAIMER}</p>
        </div>
        <div className="flex flex-col items-start gap-1 px-1 text-xs text-ink-3">
          <span className="ident whitespace-nowrap">{health.data ? `API v${health.data.version}` : <Skeleton className="h-3 w-16" />}</span>
          <AboutDialog
            trigger={
              <button type="button" className="-ml-1 inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1 py-0.5 hover:text-ink">
                <Info aria-hidden="true" className="size-3.5" />
                Sources et limites
              </button>
            }
          />
        </div>
      </div>
    </aside>
  );
}

function MobileNav() {
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn("flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem]", isActive ? "font-semibold text-policy" : "text-ink-2")
              }
            >
              <item.icon aria-hidden="true" className="size-5" />
              {item.short}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1480px] items-center gap-3 px-4 sm:px-6 lg:h-16 lg:px-8">
        <NavLink to="/" className="rounded-md lg:hidden">
          <Brand compact />
          <span className="sr-only">, vue d’ensemble</span>
        </NavLink>
        <Tip content="Moteurs turbofan simulés du jeu NASA C-MAPSS. Aucune donnée d’avion réel.">
          <button type="button" className="hidden h-7 cursor-help items-center gap-2 rounded-xs border border-line-strong px-2 text-xs text-ink-2 sm:inline-flex">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-predicted" />
            Données simulées NASA C-MAPSS
          </button>
        </Tip>
        <div className="ml-auto flex items-center gap-1">
          <span className="hidden md:block">
            <SystemStatus />
          </span>
          <span className="md:hidden">
            <SystemStatus compact />
          </span>
          <RefreshButton />
          <ThemeMenu />
          <span className="lg:hidden">
            <AboutDialog
              trigger={
                <button type="button" aria-label="Sources et limites" className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-2 hover:bg-sunken/70">
                  <Info aria-hidden="true" className="size-4" />
                </button>
              }
            />
          </span>
        </div>
      </div>
    </header>
  );
}

function PageFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement de la page">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  // Move focus to the new page on navigation (not on first load), so keyboard and screen-reader users land on the content.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-[60] rounded-md bg-policy px-3 py-2 text-on-policy focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Aller au contenu
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-[1480px] flex-1 px-4 pb-28 pt-6 outline-none sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
