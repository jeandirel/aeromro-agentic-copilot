/**
 * Copilot exchanges of this browser tab.
 *
 * Each entry is either a question, the verbatim /ask response, or the error the service returned.
 * Entries live in sessionStorage: they survive a reload but are never sent anywhere and disappear
 * with the tab. The backend keeps no conversation memory; every question is answered on its own.
 */
import { useSyncExternalStore } from "react";
import { z } from "zod";
import { askResponseSchema, fleetIdSchema, type AskResponse, type FleetId } from "./api/schemas";
import { sessionStore } from "./utils";

const STORAGE_KEY = "aeromro.copilot.v1";
const MAX_ENTRIES = 240;

const base = { id: z.string(), at: z.number(), subset: fleetIdSchema, unit: z.number().int().positive() };
const entrySchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("question"), question: z.string() }),
  z.object({ ...base, kind: z.literal("answer"), questionId: z.string(), question: z.string(), response: askResponseSchema, clientMs: z.number() }),
  z.object({
    ...base,
    kind: z.literal("error"),
    questionId: z.string(),
    question: z.string(),
    message: z.string(),
    status: z.number().nullable(),
    detail: z.string().nullable(),
    requestId: z.string().nullable(),
  }),
]);
export type CopilotEntry = z.infer<typeof entrySchema>;
export type AnswerEntry = Extract<CopilotEntry, { kind: "answer" }>;
export type ErrorEntry = Extract<CopilotEntry, { kind: "error" }>;

function load(): CopilotEntry[] {
  const raw = sessionStore.read<unknown[]>(STORAGE_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = entrySchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

let entries: CopilotEntry[] = typeof window === "undefined" ? [] : load();
const listeners = new Set<() => void>();

function commit(next: CopilotEntry[]) {
  entries = next.slice(-MAX_ENTRIES);
  sessionStore.write(STORAGE_KEY, entries);
  listeners.forEach((l) => l());
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const copilotStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  snapshot: () => entries,
  addQuestion(subset: FleetId, unit: number, question: string): string {
    const id = newId();
    commit([...entries, { id, kind: "question", at: Date.now(), subset, unit, question }]);
    return id;
  },
  addAnswer(questionId: string, subset: FleetId, unit: number, question: string, response: AskResponse, clientMs: number) {
    commit([...entries, { id: newId(), kind: "answer", at: Date.now(), subset, unit, questionId, question, response, clientMs }]);
  },
  addError(
    questionId: string,
    subset: FleetId,
    unit: number,
    question: string,
    error: { message: string; status: number | null; detail: string | null; requestId: string | null },
  ) {
    commit([...entries, { id: newId(), kind: "error", at: Date.now(), subset, unit, questionId, question, ...error }]);
  },
  removeQuestion(questionId: string) {
    commit(entries.filter((e) => e.id !== questionId));
  },
  clear() {
    commit([]);
    sessionStore.remove(STORAGE_KEY);
  },
};

export function useCopilotEntries(): CopilotEntry[] {
  return useSyncExternalStore(copilotStore.subscribe, copilotStore.snapshot, copilotStore.snapshot);
}

export interface Conversation {
  key: string;
  subset: FleetId;
  unit: number;
  lastAt: number;
  lastQuestion: string;
  questions: number;
}

export function conversationsOf(list: CopilotEntry[]): Conversation[] {
  const map = new Map<string, Conversation>();
  for (const e of list) {
    if (e.kind !== "question") continue;
    const key = `${e.subset}:${e.unit}`;
    const current = map.get(key);
    map.set(key, {
      key,
      subset: e.subset,
      unit: e.unit,
      lastAt: e.at,
      lastQuestion: e.question,
      questions: (current?.questions ?? 0) + 1,
    });
  }
  return [...map.values()].sort((a, b) => b.lastAt - a.lastAt);
}
