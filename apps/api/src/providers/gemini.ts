import type { DecisionProvider } from "@snap/shared";
import type { Env } from "./env";
import { ProviderError } from "./errors";
import { letsDecideProvider } from "./letsdecide";
import { commonOptions } from "./options";

export const GEMINI_DEFAULT_MODEL = "gemini-decision-1";

/** Google's Gemini Decision 1. Needs the GEMINI_API_KEY secret (a Google AI Studio key). */
export function geminiProvider(env: Env): DecisionProvider {
  if (!env.GEMINI_API_KEY) throw new ProviderError("config", "Gemini needs the GEMINI_API_KEY secret.");
  return letsDecideProvider({
    name: "gemini",
    model: `gemini/${env.GEMINI_MODEL ?? GEMINI_DEFAULT_MODEL}`,
    byProvider: { gemini: { apiKey: env.GEMINI_API_KEY } },
    ...commonOptions(env),
  });
}
