import type { DecisionProvider } from "@snap/shared";
import type { Env } from "./env";
import { ProviderError } from "./errors";
import { letsDecideProvider, requireHttps } from "./letsdecide";
import { commonOptions } from "./options";

export const JEV_DEFAULT_MODEL = "jev-latest";

/**
 * TypeSafe's Jev. Needs the JEV_API_KEY secret. JEV_BASE_URL is the full
 * endpoint of a gateway that speaks Jev's body, such as OpenRouter:
 * JEV_BASE_URL=https://openrouter.ai/api/alpha/decisions and
 * JEV_MODEL=typesafe/jev-1.14 (the key is then an OpenRouter key).
 */
export function jevProvider(env: Env): DecisionProvider {
  if (!env.JEV_API_KEY) throw new ProviderError("config", "Jev needs the JEV_API_KEY secret.");
  const model = env.JEV_MODEL ?? JEV_DEFAULT_MODEL;
  const common = { name: "jev", ...commonOptions(env) };
  if (!env.JEV_BASE_URL) {
    return letsDecideProvider({ ...common, model: `jev/${model}`, byProvider: { jev: { apiKey: env.JEV_API_KEY } } });
  }
  // A gateway: Jev's body at another URL, described to letsdecide as a dialect.
  const url = requireHttps("jev", env.JEV_BASE_URL);
  return letsDecideProvider({
    ...common,
    model: `jev-gateway/${model}`,
    dialects: { "jev-gateway": { extends: "jev", base_url: url.origin, path: url.pathname } },
    byProvider: { "jev-gateway": { apiKey: env.JEV_API_KEY } },
  });
}
