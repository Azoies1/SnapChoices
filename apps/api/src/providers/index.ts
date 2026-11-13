import type { DecisionProvider } from "@snap/shared";
import type { TextProvider } from "../explain";
import { mockDecisionProvider } from "./mockDecision";
import { mockTextProvider } from "./mockText";

export type Env = {
  DECISION_PROVIDER?: string;
  TEXT_PROVIDER?: string;
};

export function getDecisionProvider(env: Env): DecisionProvider {
  const name = env.DECISION_PROVIDER ?? "mock";
  switch (name) {
    case "mock":
      return mockDecisionProvider;
    case "clef":
    case "openai":
      throw new Error(`Decision provider "${name}" is not built yet (milestone 5).`);
    default:
      throw new Error(`Unknown DECISION_PROVIDER "${name}".`);
  }
}

export function getTextProvider(env: Env): TextProvider {
  const name = env.TEXT_PROVIDER ?? "mock";
  switch (name) {
    case "mock":
      return mockTextProvider;
    case "claude":
      throw new Error(`Text provider "${name}" is not built yet (milestone 5).`);
    default:
      throw new Error(`Unknown TEXT_PROVIDER "${name}".`);
  }
}
