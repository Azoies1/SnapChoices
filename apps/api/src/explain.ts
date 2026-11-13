import { GATE_FALLBACK_QUESTIONS, type DecisionInput } from "@snap/shared";

export type TextRequest =
  | (DecisionInput & { mode: "reason"; pick: string })
  | (DecisionInput & { mode: "question" })
  | (DecisionInput & { mode: "gate" });

/**
 * A text model. `generate` returns the model's structured output unvalidated;
 * the Worker validates it, retries once, then falls back to a fixed string.
 *
 * Expected shapes:
 *   reason   -> { reason: string }
 *   question -> { question: string, answers: [string, string, string] }
 *   gate     -> { questions: [string, string, string] }
 */
export interface TextProvider {
  name: string;
  generate(request: TextRequest): Promise<unknown>;
}

export type Clarifier = { question: string; answers: string[] };

export const REASON_MAX_WORDS = 25;
export const REASON_FALLBACK = "It came out ahead on what you told me.";
export const QUESTION_FALLBACK: Clarifier = {
  question: "What matters most here?",
  answers: ["Lowest cost", "Best quality", "Least hassle"],
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Exactly three distinct, non-empty, single-line strings within the length limit. */
function threeLines(raw: unknown, maxLength: number): string[] | null {
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const lines: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const line = item.trim();
    if (!line || line.length > maxLength || /[\r\n]/.test(line)) return null;
    lines.push(line);
  }
  return new Set(lines.map((l) => l.toLowerCase())).size === 3 ? lines : null;
}

/** One sentence, under 25 words. */
export function validateReason(raw: unknown): string | null {
  if (!isRecord(raw) || typeof raw.reason !== "string") return null;
  const reason = raw.reason.trim();
  if (!reason || /[\r\n]/.test(reason)) return null;
  if (reason.split(/\s+/).length >= REASON_MAX_WORDS) return null;
  return reason;
}

/** One multiple-choice question with 3 answers. */
export function validateQuestion(raw: unknown): Clarifier | null {
  if (!isRecord(raw) || typeof raw.question !== "string") return null;
  const question = raw.question.trim();
  if (!question || question.length > 140 || /[\r\n]/.test(question)) return null;
  const answers = threeLines(raw.answers, 60);
  return answers ? { question, answers } : null;
}

/**
 * Three questions for the gate screen. To keep them from favouring an option,
 * a question that names some of the user's options but not all of them is rejected.
 */
export function validateGateQuestions(raw: unknown, options: string[]): string[] | null {
  if (!isRecord(raw)) return null;
  const questions = threeLines(raw.questions, 200);
  if (!questions) return null;
  const names = options.map((o) => o.toLowerCase());
  for (const question of questions) {
    const lower = question.toLowerCase();
    const mentioned = names.filter((n) => lower.includes(n)).length;
    if (mentioned > 0 && mentioned < names.length) return null;
  }
  return questions;
}

async function generateValidated<T>(
  provider: TextProvider,
  request: TextRequest,
  validate: (raw: unknown) => T | null,
  fallback: T,
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const value = validate(await provider.generate(request));
      if (value !== null) return value;
    } catch {
      // A failed call counts as a failed validation.
    }
  }
  return fallback;
}

export function explainReason(provider: TextProvider, input: DecisionInput, pick: string): Promise<string> {
  return generateValidated(provider, { ...input, mode: "reason", pick }, validateReason, REASON_FALLBACK);
}

export function explainQuestion(provider: TextProvider, input: DecisionInput): Promise<Clarifier> {
  return generateValidated(provider, { ...input, mode: "question" }, validateQuestion, QUESTION_FALLBACK);
}

export function explainGate(provider: TextProvider, input: DecisionInput): Promise<string[]> {
  return generateValidated(
    provider,
    { ...input, mode: "gate" },
    (raw) => validateGateQuestions(raw, input.options),
    GATE_FALLBACK_QUESTIONS,
  );
}
