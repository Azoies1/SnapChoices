import { MAX_CONTEXT_LENGTH, validateOptions, type DecisionInput } from "@snap/shared";

export type ParseResult =
  | { ok: true; input: DecisionInput }
  | { ok: false; error: string; message: string };

const MAX_CLARIFIER_LENGTH = 200;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Validates the part of a request body that describes the decision itself. */
export function parseInput(body: unknown): ParseResult {
  if (!isRecord(body)) {
    return { ok: false, error: "invalid", message: "Send a JSON object." };
  }
  const options = validateOptions(body.options);
  if (!options.ok) return options;

  const input: DecisionInput = { options: options.options };

  if (body.context !== undefined && body.context !== null) {
    if (typeof body.context !== "string" || body.context.length > MAX_CONTEXT_LENGTH) {
      return {
        ok: false,
        error: "invalid_context",
        message: `Keep the context under ${MAX_CONTEXT_LENGTH} characters.`,
      };
    }
    const context = body.context.trim();
    if (context) input.context = context;
  }

  if (body.clarifier !== undefined && body.clarifier !== null) {
    const c = body.clarifier;
    if (
      !isRecord(c) ||
      typeof c.question !== "string" ||
      typeof c.chosen !== "string" ||
      c.question.length > MAX_CLARIFIER_LENGTH ||
      c.chosen.length > MAX_CLARIFIER_LENGTH ||
      !c.question.trim() ||
      !c.chosen.trim()
    ) {
      return { ok: false, error: "invalid_clarifier", message: "The clarifying answer is malformed." };
    }
    input.clarifier = { question: c.question.trim(), chosen: c.chosen.trim() };
  }

  return { ok: true, input };
}

/** The text handed to the decision model. */
export function buildState(input: DecisionInput): string {
  const lines = [
    "A person is choosing between these options:",
    ...input.options.map((o, i) => `${i + 1}. ${o}`),
  ];
  if (input.context) lines.push(`Context they gave: ${input.context}`);
  if (input.clarifier) {
    lines.push(`Asked "${input.clarifier.question}", they answered: ${input.clarifier.chosen}`);
  }
  return lines.join("\n");
}
