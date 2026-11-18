import type { DecisionProvider } from "@snap/shared";
import type { TextProvider } from "../explain";
import { clefProvider } from "./clef";
import type { Env } from "./env";
import { jevProvider } from "./jev";
import { mockDecisionProvider } from "./mockDecision";
import { mockTextProvider } from "./mockText";

export type { Env } from "./env";
export { ProviderError } from "./systemOne";

type Factory<T> = (env: Env) => T;

/**
 * Every decision model Snap can use, by the name DECISION_PROVIDER selects.
 * To add one, write a factory that returns a DecisionProvider and list it here.
 * Any model that speaks the System One wire format needs only a transport:
 * see `httpSystemOneProvider` in ./systemOne and jev.ts for a five-line example.
 */
export const decisionProviders: Record<string, Factory<DecisionProvider>> = {
  mock: () => mockDecisionProvider,
  clef: clefProvider,
  jev: jevProvider,
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
