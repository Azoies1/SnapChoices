import type { DecisionProvider } from "@snap/shared";
import type { Env } from "./env";
import { commonOptions } from "./options";
import { ProviderError, aiBindingTransport, cloudflareRestTransport, createSystemOneProvider } from "./systemOne";

/** "clef-flash" is the fast 9B model; "clef" is the larger one. Both take the same request. */
const CLEF_MODELS = ["clef-flash", "clef"] as const;

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
  const modelPath = `@cf/cloudflare/${model}`;

  if (env.AI) {
    return createSystemOneProvider({
      name: "clef",
      model,
      transport: aiBindingTransport(env.AI, modelPath),
      ...commonOptions(env),
    });
  }
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) {
    return createSystemOneProvider({
      name: "clef",
      model,
      transport: cloudflareRestTransport({
        accountId: env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: env.CLOUDFLARE_API_TOKEN,
        modelPath,
      }),
      ...commonOptions(env),
    });
  }
  throw new ProviderError("config", "Clef needs the AI binding, or CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.");
}
