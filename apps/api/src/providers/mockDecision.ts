import {
  TIERS,
  matchesCrisisKeyword,
  matchesGateKeyword,
  type Answer,
  type DecisionProvider,
  type Question,
  type Tier,
} from "@snap/shared";

/** FNV-1a, so the same input always gets the same pick. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const BIG = /\b(laptop|apartment|flat|vacation|holiday|car|degree|course|phone|sofa|couch|lease|bootcamp)\b/;
const MEDIUM =
  /\b(headphones|earbuds|gift|present|weekend|trip|restaurant|date|shoes|jacket|concert|tickets?|hotel|keyboard|monitor)\b/;

function mockTier(state: string): Tier {
  const s = state.toLowerCase();
  if (matchesGateKeyword(s)) return "gated";
  if (BIG.test(s)) return "big";
  if (MEDIUM.test(s)) return "medium";
  return "small";
}

function answer(state: string, q: Question): Answer {
  if (q.id === "crisis") {
    const yes = matchesCrisisKeyword(state) ? 0.97 : 0.01;
    return { id: q.id, probabilities: { yes, no: 1 - yes } };
  }
  if (q.id === "tier") {
    const tier = mockTier(state);
    return {
      id: q.id,
      probabilities: Object.fromEntries(TIERS.map((t) => [t, t === tier ? 0.85 : 0.05])),
    };
  }
  const options = q.kind === "yesno" ? ["yes", "no"] : q.options;
  // The state lists options in the order typed; hashing each option with the
  // state's sorted words keeps the pick the same if the user reorders them.
  const salt = state.toLowerCase().split(/\W+/).filter(Boolean).sort().join(" ");
  const weights = options.map((o) => 1 + (hash(`${o.toLowerCase()}|${salt}`) % 1000) / 333);
  const total = weights.reduce((a, b) => a + b, 0);
  return {
    id: q.id,
    probabilities: Object.fromEntries(options.map((o, i) => [o, (weights[i] ?? 0) / total])),
  };
}

/**
 * Deterministic stand-in for a decision model, for tests and local development.
 * Classification is keyword-based; picks are a stable hash of the input.
 */
export const mockDecisionProvider: DecisionProvider = {
  name: "mock",
  async decide(state, questions) {
    return questions.map((q) => answer(state, q));
  },
};
