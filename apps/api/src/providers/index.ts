import type { DecisionProvider } from "@snap/shared";
import type { TextProvider } from "../explain";
import { clefProvider } from "./clef";
import type { Env } from "./env";
import { geminiProvider } from "./gemini";
import { jevProvider } from "./jev";
import { mockDecisionProvider } from "./mockDecision";
import { mockTextProvider } from "./mockText";

export type { Env } from "./env";
export { ProviderError } from "./errors";
export { setLetsDecideWasm } from "./wasm";

type Factory<T> = (env: Env) => T;

/**
 * Every decision model Snap can use, by the name DECISION_PROVIDER selects.
 * To add one, write a factory that returns a DecisionProvider and list it here.
 * Any model letsdecide supports (Jev, Clef, Gemini, OpenAI, System One servers,
 * or a dialect) needs only a `letsDecideProvider` call: see gemini.ts.
 */
export const decisionProviders: Record<string, Factory<DecisionProvider>> = {
  mock: () => mockDecisionProvider,
  clef: clefProvider,
  jev: jevProvider,
  gemini: geminiProvider,
};

/** Text models for reasons, clarifying questions and gate questions. Claude Haiku joins in milestone 5. */
export const textProviders: Record<string, Factory<TextProvider>> = {
  mock: () => mockTextProvider,
};

function pick<T>(kind: string, registry: Record<string, Factory<T>>, name: string, env: Env): T {
  const factory = Object.hasOwn(registry, name) ? registry[name] : undefined;
  if (!factory) throw new Error(`Unknown ${kind} "${name}". Known: ${Object.keys(registry).join(", ")}.`);
  return factory(env);
}

export const getDecisionProvider = (env: Env) =>
  pick("DECISION_PROVIDER", decisionProviders, env.DECISION_PROVIDER ?? "mock", env);

export const getTextProvider = (env: Env) =>
  pick("TEXT_PROVIDER", textProviders, env.TEXT_PROVIDER ?? "mock", env);
