import type { DecisionProvider } from "@snap/shared";
import type { Env } from "./env";
import { ProviderError, httpSystemOneProvider } from "./systemOne";

/** TypeSafe's own endpoint. Point JEV_BASE_URL at a gateway to route through it instead. */
export const JEV_DEFAULT_URL = "https://api.typesafe.ai/v1/systemone";
export const JEV_DEFAULT_MODEL = "jev-latest";

/**
 * TypeSafe's Jev. Needs the JEV_API_KEY secret. Through OpenRouter, set
 * JEV_BASE_URL=https://openrouter.ai/api/alpha/decisions and
 * JEV_MODEL=typesafe/jev-1.14 (the key is then an OpenRouter key).
 */
export function jevProvider(env: Env): DecisionProvider {
  if (!env.JEV_API_KEY) throw new ProviderError("config", "Jev needs the JEV_API_KEY secret.");
  return httpSystemOneProvider({
    name: "jev",
    url: env.JEV_BASE_URL ?? JEV_DEFAULT_URL,
    apiKey: env.JEV_API_KEY,
    model: env.JEV_MODEL ?? JEV_DEFAULT_MODEL,
  });
}
