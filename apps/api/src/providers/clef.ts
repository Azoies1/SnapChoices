import type { DecisionProvider } from "@snap/shared";
import type { AiBinding, Env } from "./env";
import { ProviderError } from "./errors";
import { letsDecideProvider } from "./letsdecide";
import { commonOptions } from "./options";

/** "clef-flash" is the fast 9B model; "clef" is the larger one. Both take the same request. */
const CLEF_MODELS = ["clef-flash", "clef"] as const;

/** letsdecide needs an account id to build Clef's REST URL; the binding shim ignores it. */
const BINDING_ACCOUNT = "workers-ai-binding";

/**
 * Sends the request letsdecide built for Cloudflare's REST API through the
 * Workers AI binding instead: same body, no key, no hop outside Cloudflare.
 * The reply is wrapped in the REST envelope so letsdecide parses it as usual.
 */
export function aiBindingFetch(ai: AiBinding): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const modelPath = decodeURIComponent(new URL(url).pathname.split("/ai/run/")[1] ?? "");
    if (!modelPath.startsWith("@cf/")) throw new ProviderError("config", "Unexpected Clef URL.");
    const result = await ai.run(modelPath, JSON.parse(String(init?.body ?? "{}")));
    return new Response(JSON.stringify({ success: true, errors: [], result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

/**
 * Cloudflare's Clef on Workers AI. Inside a Worker it uses the AI binding.
 * Anywhere else (the eval script) it uses Cloudflare's REST API with
 * CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.
 */
export function clefProvider(env: Env): DecisionProvider {
  const model = env.CLEF_MODEL ?? "clef-flash";
  if (!(CLEF_MODELS as readonly string[]).includes(model)) {
    throw new ProviderError("config", `CLEF_MODEL must be one of: ${CLEF_MODELS.join(", ")}.`);
  }
  const common = { name: "clef", model: `clef/${model}`, ...commonOptions(env) };

  if (env.AI) {
    return letsDecideProvider({
      ...common,
      byProvider: { clef: { accountId: BINDING_ACCOUNT, apiKey: "unused" } },
      fetch: aiBindingFetch(env.AI),
    });
  }
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) {
    return letsDecideProvider({
      ...common,
      byProvider: { clef: { accountId: env.CLOUDFLARE_ACCOUNT_ID, apiKey: env.CLOUDFLARE_API_TOKEN } },
    });
  }
  throw new ProviderError("config", "Clef needs the AI binding, or CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.");
}
