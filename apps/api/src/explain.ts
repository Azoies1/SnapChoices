import type { DecisionInput } from "@snap/shared";

export type TextRequest = DecisionInput & { mode: "reason"; pick: string };

/**
 * A text model. `generate` returns the model's structured output unvalidated;
 * the Worker validates it, retries once, then falls back to a fixed string.
 */
export interface TextProvider {
  name: string;
  generate(request: TextRequest): Promise<unknown>;
}

export const REASON_FALLBACK = "It came out ahead on what you told me.";
export const REASON_MAX_WORDS = 25;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** One sentence, under 25 words. */
export function validateReason(raw: unknown): string | null {
  if (!isRecord(raw) || typeof raw.reason !== "string") return null;
  const reason = raw.reason.trim();
  if (!reason || /[\r\n]/.test(reason)) return null;
  if (reason.split(/\s+/).length >= REASON_MAX_WORDS) return null;
  return reason;
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
