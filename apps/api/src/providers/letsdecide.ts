/**
 * Every real decision model goes through the `letsdecide` library: it builds
 * each provider's request and checks its reply, so Snap only maps its own
 * question and answer shapes onto letsdecide's canonical ones.
 *
 * Snap's interface (from the brief) keys a choice's probabilities by the
 * user's option text. letsdecide option ids must match `[a-z0-9_]{1,64}`, so
 * when any option is not already such an id, every option is sent under a
 * positional id (`o0`, `o1`, ...) with the user's text as its description, and
 * the answer is mapped back to the text.
 */
import type { Answer, DecisionProvider, Question } from "@snap/shared";
import {
  Client,
  LetsDecideError,
  type ClientOptions,
  type DecisionRequest,
  type DecisionResponse,
  type DialectSpec,
  type ProviderSettings,
  type Question as LdQuestion,
} from "letsdecide";
import { ProviderError } from "./errors";
import { letsDecideWasm } from "./wasm";

export const DEFAULT_TIMEOUT_MS = 8000;

const ID = /^[a-z0-9_]{1,64}$/;
const MAX_QUESTIONS = 64;
const MAX_CHOICES = 255;

type Encoded = {
  request: DecisionRequest;
  /** Per choice question: wire option id -> the user's option text. */
  labels: Map<string, Map<string, string>>;
  yesno: Set<string>;
};

export function encode(state: string, questions: Question[]): Encoded {
  if (questions.length < 1 || questions.length > MAX_QUESTIONS) {
    throw new ProviderError("request", "A request needs 1 to 64 questions.");
  }
  const wire: Record<string, LdQuestion> = {};
  const labels = new Map<string, Map<string, string>>();
  const yesno = new Set<string>();
  for (const q of questions) {
    if (!ID.test(q.id) || Object.hasOwn(wire, q.id)) {
      throw new ProviderError("request", "A question id is invalid or repeated.");
    }
    if (q.kind === "yesno") {
      wire[q.id] = { kind: "yesno", instructions: q.text };
      yesno.add(q.id);
      continue;
    }
    const distinct = new Set(q.options);
    if (q.options.length < 2 || q.options.length > MAX_CHOICES || distinct.size !== q.options.length || q.options.some((o) => !o)) {
      throw new ProviderError("request", "A choice needs 2 to 255 distinct, non-empty options.");
    }
    const asIs = q.options.every((o) => ID.test(o));
    const map = new Map(q.options.map((o, i) => [asIs ? o : `o${i}`, o]));
    wire[q.id] = {
      kind: "choice",
      instructions: q.text,
      options: Object.fromEntries([...map].map(([id, text]) => [id, asIs ? "" : text])),
    };
    labels.set(q.id, map);
  }
  return { request: { input: state, questions: wire }, labels, yesno };
}

/**
 * Back to Snap's answers. A question the provider skipped or refused is left
 * out, so callers see a missing answer and fail closed. letsdecide has already
 * checked every number is a probability.
 */
export function decode(encoded: Encoded, response: DecisionResponse): Answer[] {
  const answers: Answer[] = [];
  for (const [id, answer] of Object.entries(response.answers)) {
    if (answer.kind === "yesno" && encoded.yesno.has(id)) {
      answers.push({ id, probabilities: { yes: answer.probability, no: 1 - answer.probability } });
    } else if (answer.kind === "choice" && encoded.labels.has(id)) {
      const map = encoded.labels.get(id)!;
      const probabilities = Object.fromEntries([...map].map(([wireId, text]) => [text, answer.probabilities[wireId] ?? 0]));
      if (Object.values(probabilities).reduce((sum, p) => sum + p, 0) <= 0) {
        throw new ProviderError("malformed", "A choice answer carried no probability.");
      }
      answers.push({ id, probabilities });
    } else if (answer.kind !== "refused") {
      throw new ProviderError("malformed", "An answer had the wrong kind.");
    }
  }
  return answers;
}

/** letsdecide errors never carry keys or bodies; Snap's carry a code and a generic message only. */
function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (!(error instanceof LetsDecideError)) return new ProviderError("http", "The request failed.");
  const reason = error.details?.reason;
  if (reason === "missing_config" || reason === "invalid_config" || error.code === "Auth") {
    return new ProviderError("config", "The provider is not configured correctly.");
  }
  switch (error.code) {
    case "InvalidRequest":
    case "Unsupported":
      return new ProviderError("request", "The provider cannot take this request.");
    case "BadResponse":
      return new ProviderError("malformed", "The provider sent an unexpected response.");
    default:
      return new ProviderError("http", `The provider failed (${error.code}).`);
  }
}

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

export type LetsDecideOptions = {
  /** Snap's name for the provider, shown by /api/health. */
  name: string;
  /** letsdecide model string, e.g. "clef/clef-flash". */
  model: string;
  /** Settings for this provider only, under its letsdecide prefix. */
  byProvider: Record<string, ProviderSettings>;
  fetch?: typeof fetch;
  dialects?: Record<string, DialectSpec>;
  timeoutMs?: number;
  /** Development aid: receives the underlying failure. Off by default because provider errors can quote input. */
  onError?: (error: unknown) => void;
};

export function letsDecideProvider(options: LetsDecideOptions): DecisionProvider {
  const { name, model, timeoutMs = DEFAULT_TIMEOUT_MS, onError } = options;
  let client: Client | undefined;
  const getClient = () => {
    if (client) return client;
    const wasm = letsDecideWasm();
    const clientOptions: ClientOptions = {
      // letsdecide 0.3.0 calls its stored fetch as a method; workerd rejects
      // `globalThis.fetch` called that way ("Illegal invocation"), so always wrap it.
      fetch: options.fetch ?? ((input, init) => globalThis.fetch(input, init)),
      ...(options.dialects ? { dialects: options.dialects } : {}),
      ...(wasm ? { wasm } : {}),
    };
    return (client = new Client({ byProvider: options.byProvider }, clientOptions));
  };
  return {
    name,
    async decide(state, questions) {
      const encoded = encode(state, questions);
      let response: DecisionResponse;
      try {
        response = await withTimeout(timeoutMs, (signal) => getClient().decide(model, encoded.request, { signal }));
      } catch (error) {
        onError?.(error);
        throw toProviderError(error);
      }
      return decode(encoded, response);
    },
  };
}

/** Rejects a key-bearing URL that is not https (localhost excepted, for tests). */
export function requireHttps(name: string, url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ProviderError("config", `${name}: the URL is not valid.`);
  }
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !local) {
    throw new ProviderError("config", `${name}: the URL must be https.`);
  }
  return parsed;
}
