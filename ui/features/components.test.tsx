import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip } from "radix-ui";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { askResponseSchema } from "@/lib/api/schemas";
import { copilotStore, type AnswerEntry } from "@/lib/copilot-store";
import { SAMPLE_ASK, SAMPLE_ENGINE } from "@/test/fixtures";
import { RulTape } from "@/components/instruments/rul-tape";
import { AnswerCard, ErrorCard } from "./copilot/answer-card";
import CopilotPage from "./copilot/copilot-page";

const thresholds = { inspect_now: 15, plan_inspection: 50 };

function answerEntry(overrides: Record<string, unknown> = {}): AnswerEntry {
  return {
    id: "a1",
    kind: "answer",
    at: Date.UTC(2026, 9, 20, 8, 0, 0),
    subset: "FD001",
    unit: 81,
    questionId: "q1",
    question: "Statut ?",
    response: askResponseSchema.parse({ ...SAMPLE_ASK, ...overrides }),
    clientMs: 1300,
  };
}

function wrap(ui: ReactNode, route = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Tooltip.Provider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path="*" element={ui} />
          </Routes>
        </MemoryRouter>
      </Tooltip.Provider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  copilotStore.clear();
});

describe("RulTape", () => {
  it("describes estimate, interval and thresholds for assistive technology", () => {
    render(<RulTape rul={3} low={0.3} high={12.9} thresholds={thresholds} max={150} size="lg" />);
    const tape = screen.getByRole("img");
    expect(tape).toHaveAccessibleName(/RUL estimé 3,0 cycles, intervalle à 80 % de 0,3 – 12,9 cycles. Seuils : inspection à 15 cycles, planification à 50 cycles./);
    expect(screen.getByText("cycles restants")).toBeInTheDocument();
  });
});

describe("AnswerCard", () => {
  it("separates structured facts, policy decision and generated text", () => {
    wrap(<AnswerCard entry={answerEntry()} thresholds={thresholds} max={150} />);
    const facts = screen.getByRole("region", { name: "Faits du modèle RUL" });
    expect(within(facts).getByText("Cycles parcourus")).toBeInTheDocument();
    expect(within(facts).getByText("213")).toBeInTheDocument();
    expect(within(facts).getByText("Cycles restants (RUL)")).toBeInTheDocument();
    expect(within(facts).getByText("3,0")).toBeInTheDocument();
    const policy = screen.getByRole("region", { name: "Décision de la politique" });
    expect(within(policy).getByText("Autorisé")).toBeInTheDocument();
    const text = screen.getByRole("region", { name: "Explication générée" });
    expect(within(text).getByText(/3 cycles/)).toBeInTheDocument();
    expect(within(text).getByText(/Ne constitue pas une certification de navigabilité/)).toBeInTheDocument();
    expect(screen.getByText("eu.amazon.nova-2-lite-v1:0")).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    // The answer is read first, then the policy decision, then the facts it rests on.
    expect(text.compareDocumentPosition(policy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(policy.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("makes human review and fallback mode explicit", () => {
    wrap(
      <AnswerCard
        entry={answerEntry({
          answer: "[summary without language model] Engine 81 of FD001 has flown 213 cycles.",
          policy: { action: "recommend_inspection", decision: "require_approval", reason: "confidence below 0.70: human review required" },
          requires_approval: true,
          fallback_reason: "ThrottlingException",
          usage: { ...SAMPLE_ASK.usage, model: "facts-summary" },
        })}
        thresholds={thresholds}
        max={150}
      />,
    );
    expect(screen.getByText(/Validation humaine requise : un ingénieur de maintenance/)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("ThrottlingException");
    expect(screen.getByText("Résumé automatique des faits")).toBeInTheDocument();
    expect(screen.queryByText(/\[summary without language model\]/)).not.toBeInTheDocument();
    expect(screen.getByText(/Confiance inférieure à 0,7/)).toBeInTheDocument();
  });

  it("flags an answer about another engine", () => {
    wrap(<AnswerCard entry={{ ...answerEntry(), unit: 82 }} thresholds={thresholds} max={150} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Incohérence");
  });
});

describe("ErrorCard", () => {
  it("explains the failure and offers to ask again", async () => {
    const onRetry = vi.fn();
    wrap(
      <ErrorCard
        entry={{ id: "e", kind: "error", at: 0, subset: "FD001", unit: 81, questionId: "q", question: "Statut ?", message: "Limite atteinte.", status: 429, detail: "rate limit reached", requestId: null }}
        onRetry={onRetry}
        disabled={false}
      />,
    );
    expect(screen.getByText("HTTP 429 — rate limit reached")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reposer la question" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("CopilotPage", () => {
  function stubApi(askHandler: () => Response | Promise<Response>) {
    const calls: { path: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = decodeURIComponent(new URL(url, "http://x").searchParams.get("path") ?? "");
        calls.push({ path, init });
        const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { "content-type": "application/json" } });
        if (path === "/fleets") return json([]);
        if (path === "/fleets/FD001/engines") return json({ subset: "FD001", thresholds, engines: [SAMPLE_ENGINE, { ...SAMPLE_ENGINE, unit: 12, rul: 80, rul_low: 60, rul_high: 99, status: "healthy" }] });
        if (path === "/ask") return askHandler();
        return new Response("{}", { status: 404 });
      }),
    );
    return calls;
  }

  it("sends the question to POST /ask and renders the API answer", async () => {
    const calls = stubApi(() => new Response(JSON.stringify(SAMPLE_ASK), { headers: { "content-type": "application/json" } }));
    wrap(<CopilotPage />, "/copilot?fleet=FD001&engine=81");
    const input = await screen.findByLabelText(/Votre question sur FD001, moteur 081/);
    await waitFor(() => expect(input).toBeEnabled());
    await userEvent.type(input, "Faut-il inspecter ce moteur ?{Enter}");
    expect(await screen.findByRole("article", { name: /Réponse du copilote pour FD001, moteur 081/ })).toBeInTheDocument();
    const ask = calls.find((c) => c.path === "/ask")!;
    expect(ask.init?.method).toBe("POST");
    expect(JSON.parse(String(ask.init?.body))).toEqual({ subset: "FD001", unit: 81, question: "Faut-il inspecter ce moteur ?" });
    expect(screen.getByRole("status")).toHaveTextContent("Réponse reçue.");
  });

  it("shows the service error instead of inventing an answer", async () => {
    stubApi(() => new Response(JSON.stringify({ error: "Le modèle de langage est indisponible.", detail: "language model unavailable: ClientError" }), { status: 502, headers: { "content-type": "application/json" } }));
    wrap(<CopilotPage />, "/copilot?fleet=FD001&engine=81");
    const suggestion = await screen.findByRole("button", { name: /Pourquoi faut-il inspecter ce moteur/ });
    await waitFor(() => expect(suggestion).toBeEnabled());
    await userEvent.click(suggestion);
    expect(await screen.findByText("Aucune réponse du copilote")).toBeInTheDocument();
    expect(screen.getByText("Le modèle de langage est indisponible.")).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: /Réponse du copilote/ })).not.toBeInTheDocument();
  });
});

describe("GeneratedText", () => {
  it("renders bold and lists and never interprets HTML from the model", async () => {
    const { GeneratedText } = await import("@/components/ui/generated-text");
    const { container } = render(<GeneratedText text={"Il reste **15 cycles**.\n- point <img src=x onerror=alert(1)>\n- second"} />);
    expect(container.querySelector("strong")).toHaveTextContent("15 cycles");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("<img src=x onerror=alert(1)>");
  });
});
