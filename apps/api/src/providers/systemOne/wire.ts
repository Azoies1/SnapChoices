/**
 * The System One wire format, shared by every decision model that speaks it
 * (Clef, Jev, and gateways that front them): a `state` plus a map of typed
 * `questions` goes in, one typed answer per question comes out.
 *
 * Verified against Cloudflare's published Clef-flash input/output schemas and
 * TypeSafe's Jev documentation. Only the two question types Snap uses are
 * encoded: `noul` (yes/no) and `choice`.
 */
import type { Answer, Question } from "@snap/shared";

export type ProviderErrorCode = "config" | "request" | "timeout" | "http" | "malformed";

/** Carries a code and a generic message only. Never put user text or model output in here. */
export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export type SystemOneQuestion =
  | { type: "noul"; instructions: string }
  | { type: "choice"; instructions: string; criteria: Record<string, null> };

export type SystemOneRequest = {
  model: string;
  state: string;
  questions: Record<string, SystemOneQuestion>;
};

const ID_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;
const MAX_QUESTIONS = 64;
const MAX_CHOICES = 255;
/** Providers round to a few decimals; allow for that without accepting nonsense. */
const PROBABILITY_SLACK = 1e-6;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function encodeRequest(model: string, state: string, questions: Question[]): SystemOneRequest {
  if (questions.length < 1 || questions.length > MAX_QUESTIONS) {
    throw new ProviderError("request", "A request needs 1 to 64 questions.");
  }
  const encoded: Record<string, SystemOneQuestion> = {};
  for (const q of questions) {
    if (!ID_PATTERN.test(q.id) || Object.hasOwn(encoded, q.id)) {
      throw new ProviderError("request", "A question id is invalid or repeated.");
    }
    if (q.kind === "yesno") {
      encoded[q.id] = { type: "noul", instructions: q.text };
      continue;
    }
    const criteria: Record<string, null> = Object.fromEntries(q.options.map((o) => [o, null]));
    const count = Object.keys(criteria).length;
    if (count < 2 || count > MAX_CHOICES || count !== q.options.length || q.options.some((o) => !o)) {
      throw new ProviderError("request", "A choice needs 2 to 255 distinct, non-empty options.");
    }
    encoded[q.id] = { type: "choice", instructions: q.text, criteria };
  }
  return { model, state, questions: encoded };
}

function probability(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1 + PROBABILITY_SLACK) {
    throw new ProviderError("malformed", "A probability was missing or out of range.");
  }
  return Math.min(value, 1);
}

function decodeNoul(raw: unknown): Record<string, number> {
  if (!isRecord(raw) || raw.type !== "noul") {
    throw new ProviderError("malformed", "Expected a noul answer.");
  }
  const yes = probability(raw.noul);
  return { yes, no: 1 - yes };
}

function decodeChoice(raw: unknown, options: string[]): Record<string, number> {
  if (!isRecord(raw) || raw.type !== "choice" || !isRecord(raw.probabilities)) {
    throw new ProviderError("malformed", "Expected a choice answer.");
  }
  const given = raw.probabilities;
  // An option the provider left out has probability 0; anything it invented is ignored.
  const probabilities = Object.fromEntries(
    options.map((o) => [o, Object.hasOwn(given, o) ? probability(given[o]) : 0]),
  );
  if (Object.values(probabilities).reduce((sum, p) => sum + p, 0) <= 0) {
    throw new ProviderError("malformed", "A choice answer carried no probability.");
  }
  return probabilities;
}

/**
 * Turns a response into provider-interface answers. A question the provider
 * did not answer is left out, so callers see a missing answer and fail closed.
 * A present but malformed answer throws.
 */
export function decodeAnswers(request: SystemOneRequest, response: unknown): Answer[] {
  if (!isRecord(response) || !isRecord(response.answers)) {
    throw new ProviderError("malformed", "The response had no answers.");
  }
  const answers: Answer[] = [];
  for (const [id, question] of Object.entries(request.questions)) {
    if (!Object.hasOwn(response.answers, id)) continue;
    const raw = response.answers[id];
    answers.push({
      id,
      probabilities:
        question.type === "noul" ? decodeNoul(raw) : decodeChoice(raw, Object.keys(question.criteria)),
    });
  }
  return answers;
}
