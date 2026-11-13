import type { DecisionProvider } from "@snap/shared";
import { mockDecisionProvider } from "./mockDecision";

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
