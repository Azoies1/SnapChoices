export type ProviderErrorCode = "config" | "request" | "timeout" | "http" | "malformed";

/** Carries a code and a generic message only. Never put user text or model output in here. */
export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
