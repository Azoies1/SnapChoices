/** The one method of the Workers AI binding that Snap uses. */
export type AiBinding = { run(model: string, input: unknown): Promise<unknown> };

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

  /** Milliseconds before a decision-model call gives up. Default 8000. */
  PROVIDER_TIMEOUT_MS?: string;
  /** "1" logs the underlying provider failure. Local debugging only: provider errors can quote the input. */
  DEBUG_PROVIDER_ERRORS?: string;

  /** Secret. A TypeSafe key, or an OpenRouter key if JEV_BASE_URL points there. */
  JEV_API_KEY?: string;
  JEV_BASE_URL?: string;
  JEV_MODEL?: string;

  /** Secret. A Google AI Studio key for the Decisions API. */
  GEMINI_API_KEY?: string;
  /** Default "gemini-decision-1". */
  GEMINI_MODEL?: string;
};
