import { ProviderError, type SystemOneRequest } from "./wire";

/**
 * How a request reaches a model. A transport returns the parsed JSON body and
 * nothing else; encoding, decoding, timeouts and error normalisation live
 * elsewhere, so supporting a new host means writing one of these.
 */
export type Transport = (request: SystemOneRequest, signal: AbortSignal) => Promise<unknown>;

/** The one method of the Workers AI binding that Snap uses. */
export type AiBinding = { run(model: string, input: unknown): Promise<unknown> };

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
const defaultFetch: FetchLike = (input, init) => globalThis.fetch(input, init);

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new ProviderError("malformed", "The provider returned invalid JSON.");
  }
}

/** Inside a Worker: the Workers AI binding. No key, no network hop outside Cloudflare. */
export function aiBindingTransport(ai: AiBinding, modelPath: string): Transport {
  return (request) => ai.run(modelPath, request);
}

/**
 * Outside a Worker (the eval script, local scripts): Cloudflare's REST API.
 * Responses arrive in Cloudflare's usual envelope, so the model output is
 * under `result`.
 */
export function cloudflareRestTransport(options: {
  accountId: string;
  apiToken: string;
  modelPath: string;
  fetch?: FetchLike;
}): Transport {
  const f = options.fetch ?? defaultFetch;
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}/ai/run/${options.modelPath}`;
  return async (request, signal) => {
    const res = await f(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${options.apiToken}` },
      body: JSON.stringify(request),
      signal,
    });
    const body = await readJson(res);
    const envelope = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    if (!res.ok || envelope.success === false) {
      throw new ProviderError("http", `Cloudflare returned ${res.status}.`);
    }
    return envelope.result;
  };
}

/** Any host that takes the System One body over HTTPS with a bearer key: TypeSafe, OpenRouter, other gateways. */
export function httpTransport(options: { url: string; apiKey: string; fetch?: FetchLike }): Transport {
  const f = options.fetch ?? defaultFetch;
  return async (request, signal) => {
    const res = await f(options.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify(request),
      signal,
    });
    if (!res.ok) throw new ProviderError("http", `The provider returned ${res.status}.`);
    return readJson(res);
  };
}
