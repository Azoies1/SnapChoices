import type { DecisionProvider } from "@snap/shared";
import { httpTransport, type Transport } from "./transports";
import { ProviderError, decodeAnswers, encodeRequest } from "./wire";

export * from "./transports";
export * from "./wire";

export const DEFAULT_TIMEOUT_MS = 8000;

async function withTimeout<T>(ms: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Reject first: aborting makes a fetch reject at once, and that must not win the race.
      reject(new ProviderError("timeout", "The provider timed out."));
      controller.abort();
    }, ms);
  });
  try {
    return await Promise.race([work(controller.signal), expired]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Builds a DecisionProvider for any System One model from a transport. Every
 * failure surfaces as a ProviderError with a generic message, so nothing a
 * user typed or a model returned can reach a log through an error.
 */
export function createSystemOneProvider(options: {
  name: string;
  model: string;
  transport: Transport;
  timeoutMs?: number;
  /** Development aid: receives the underlying failure. Off by default because provider errors can quote input. */
  onError?: (error: unknown) => void;
}): DecisionProvider {
  const { name, model, transport, timeoutMs = DEFAULT_TIMEOUT_MS, onError } = options;
  return {
    name,
    async decide(state, questions) {
      const request = encodeRequest(model, state, questions);
      let response: unknown;
      try {
        response = await withTimeout(timeoutMs, (signal) => transport(request, signal));
      } catch (error) {
        onError?.(error);
        throw error instanceof ProviderError ? error : new ProviderError("http", "The request failed.");
      }
      return decodeAnswers(request, response);
    },
  };
}

/**
 * The shortest path to a new provider: any host that accepts the System One
 * body over HTTPS with a bearer key (OpenRouter, other gateways, a provider's
 * own endpoint).
 */
export function httpSystemOneProvider(options: {
  name: string;
  url: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  onError?: (error: unknown) => void;
}): DecisionProvider {
  let parsed: URL;
  try {
    parsed = new URL(options.url);
  } catch {
    throw new ProviderError("config", `${options.name}: the URL is not valid.`);
  }
  // The key travels in a header, so never over plain HTTP (except to a local test server).
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !local) {
    throw new ProviderError("config", `${options.name}: the URL must be https.`);
  }
  return createSystemOneProvider({
    name: options.name,
    model: options.model,
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.onError ? { onError: options.onError } : {}),
    transport: httpTransport({ url: options.url, apiKey: options.apiKey }),
  });
}
