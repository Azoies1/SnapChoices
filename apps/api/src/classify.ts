import {
  CRISIS_THRESHOLD,
  TIERS,
  matchesCrisisKeyword,
  matchesGateKeyword,
  resolveTier,
  type ClassifyResponse,
  type DecisionInput,
  type DecisionProvider,
  type Question,
} from "@snap/shared";
import { buildState } from "./input";

/** Thrown when no trustworthy classification exists. Callers must not pick. */
export class ClassificationError extends Error {}

export const CRISIS_QUESTION: Question = {
  id: "crisis",
  kind: "yesno",
  text: "Do the options or the context mention the person harming themselves or someone else?",
};

export const TIER_QUESTION: Question = {
  id: "tier",
  kind: "choice",
  text: [
    "How big is this decision?",
    "small: free or cheap, undone the same day (what to eat, what to watch).",
    "medium: some money or a few days, annoying to undo (headphones, a gift, a weekend trip).",
    "big: months of commitment, recoverable (a laptop, a shortlisted apartment, a vacation).",
    "gated: life-altering or hard to reverse (quitting a job, marriage or divorce, medical, legal, major money, moving countries, having children).",
  ].join("\n"),
  options: [...TIERS],
};

function usable(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

/**
 * One decision-model call with two questions about the same state, then the
 * keyword backstops and the fail-closed rule. The crisis check comes first
 * and takes priority over the tier.
 */
export async function classify(provider: DecisionProvider, input: DecisionInput): Promise<ClassifyResponse> {
  // Backstops read everything the user typed, including a clarifying answer and any nudges.
  const everything = [
    ...input.options,
    input.context ?? "",
    input.clarifier?.question ?? "",
    input.clarifier?.chosen ?? "",
    ...(input.nudges ?? []),
  ].join("\n");

  if (matchesCrisisKeyword(everything)) return { tier: "gated", crisis: true };

  // The model sees only the options and context, so a clarifying answer or a nudge cannot talk it down a tier.
  const state = buildState({ options: input.options, ...(input.context ? { context: input.context } : {}) });

  let answers;
  try {
    answers = await provider.decide(state, [CRISIS_QUESTION, TIER_QUESTION]);
  } catch {
    throw new ClassificationError("provider_failed");
  }

  const crisis = answers.find((a) => a.id === CRISIS_QUESTION.id)?.probabilities;
  const yes = crisis?.yes;
  const no = crisis?.no;
  if (!usable(yes) || !usable(no) || yes + no <= 0) throw new ClassificationError("unusable_crisis_answer");
  if (yes / (yes + no) >= CRISIS_THRESHOLD) return { tier: "gated", crisis: true };

  const tierAnswer = answers.find((a) => a.id === TIER_QUESTION.id)?.probabilities;
  const tier = tierAnswer ? resolveTier(tierAnswer) : null;
  if (!tier) throw new ClassificationError("unusable_tier_answer");

  return { tier: matchesGateKeyword(everything) ? "gated" : tier, crisis: false };
}
