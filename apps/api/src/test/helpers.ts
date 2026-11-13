import type { Answer, DecisionProvider, Question } from "@snap/shared";
import { createApp, type Deps } from "../app";

/** A provider that answers each question id from a fixed table. Missing ids are left out. */
export function stubProvider(table: Record<string, Record<string, number>>): DecisionProvider & {
  calls: { state: string; questions: Question[] }[];
} {
  const calls: { state: string; questions: Question[] }[] = [];
  return {
    name: "stub",
    calls,
    async decide(state, questions) {
      calls.push({ state, questions });
      return questions
        .filter((q) => table[q.id])
        .map((q): Answer => ({ id: q.id, probabilities: table[q.id]! }));
    },
  };
}

export const failingProvider: DecisionProvider = {
  name: "failing",
  async decide() {
    throw new Error("boom");
  },
};

export function post(path: string, body: unknown, deps: Deps = {}) {
  return createApp(deps).request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
