/** Ordered from lowest to highest stakes. The order matters to the fail-closed rule. */
export const TIERS = ["small", "medium", "big", "gated"] as const;
export type Tier = (typeof TIERS)[number];

// ---- Decision provider interface (from the brief) ----

export type Question =
  | { id: string; kind: "yesno"; text: string }
  | { id: string; kind: "choice"; text: string; options: string[] };

export type Answer = {
  id: string;
  // probability per option; for yesno the keys are "yes" and "no"
  probabilities: Record<string, number>;
};

export interface DecisionProvider {
  name: string;
  decide(state: string, questions: Question[]): Promise<Answer[]>;
}

// ---- The one record type, stored only on the device ----

export type Decision = {
  id: string; // uuid
  createdAt: number; // epoch ms
  options: string[]; // 2 to 4
  context?: string;
  tier: Tier;
  crisis: boolean;
  clarifier?: { question: string; answers: string[]; chosen: string };
  probabilities?: Record<string, number>;
  pick?: string;
  runnerUp?: string;
  closeCall?: boolean;
  reason?: string;
  reaction?: "accepted" | "switched" | "neither";
  finalChoice?: string;
  resolvedAt?: number;
  regret?: "yes" | "no" | "skipped";
  timings: { classifyMs?: number; decideMs?: number; explainMs?: number };
  provider: string;
};

// ---- Wire types between the web app and the Worker ----

export type DecisionInput = {
  options: string[];
  context?: string;
  clarifier?: { question: string; chosen: string };
};

export type ClassifyResponse = { tier: Tier; crisis: boolean };

export type RankedOption = { option: string; probability: number };

/** `tier` may be sent by a client but the Worker ignores it and re-classifies. */
export type DecideRequest = DecisionInput & { tier?: Tier };

export type DecideResponse = {
  tier: Tier;
  ranked: RankedOption[];
  pick: string;
  runnerUp: string;
  closeCall: boolean;
  provider: string;
};

export type ExplainMode = "reason" | "question" | "gate";

export type ExplainRequest = DecisionInput & { mode: ExplainMode; pick?: string };

export type ExplainResponse =
  | { mode: "reason"; reason: string }
  | { mode: "question"; question: string; answers: string[] }
  | { mode: "gate"; questions: string[] };

export type ApiErrorBody = { error: string; message?: string };
