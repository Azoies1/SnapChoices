import type { AiBinding } from "./systemOne";

/** Bindings, variables and secrets. Everything is optional so the mock provider needs none. */
export type Env = {
  /** Which decision model to use: see `decisionProviders`. Default "mock". */
  DECISION_PROVIDER?: string;
  /** Which text model writes reasons and questions. Default "mock". */
  TEXT_PROVIDER?: string;

  /** Workers AI binding. Present when wrangler is run with the `cloudflare` environment. */
  AI?: AiBinding;
  /** "clef-flash" (default) or "clef". */
  CLEF_MODEL?: string;
  /** REST fallback for Clef when there is no AI binding, such as in the eval script. */
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;

  /** Secret. A TypeSafe key, or an OpenRouter key if JEV_BASE_URL points there. */
  JEV_API_KEY?: string;
  JEV_BASE_URL?: string;
  JEV_MODEL?: string;
};
