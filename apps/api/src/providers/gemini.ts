import type { DecisionProvider } from "@snap/shared";
import type { Env } from "./env";
import { commonOptions } from "./options";
import { ProviderError, createSystemOneProvider, geminiTransport } from "./systemOne";

/** Google's Decisions API (v1beta). Third-party docs only: re-check against aistudio.google.com/docs/decisions-api. */
export const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/decisions";
export const GEMINI_DEFAULT_MODEL = "gemini-decision-1";

/** Google's Gemini Decision 1. Needs the GEMINI_API_KEY secret (a Google AI Studio key). */
export function geminiProvider(env: Env): DecisionProvider {
  if (!env.GEMINI_API_KEY) throw new ProviderError("config", "Gemini needs the GEMINI_API_KEY secret.");
  return createSystemOneProvider({
    name: "gemini",
    model: env.GEMINI_MODEL ?? GEMINI_DEFAULT_MODEL,
    transport: geminiTransport({ url: GEMINI_URL, apiKey: env.GEMINI_API_KEY }),
    ...commonOptions(env),
  });
}
