import { describe, expect, it, vi } from "vitest";
import type { DecisionProvider, Question } from "@snap/shared";
import { classify } from "../classify";
import { post } from "../test/helpers";
import { clefProvider } from "./clef";
import { decisionProviders, getDecisionProvider } from "./index";
import { jevProvider } from "./jev";
import { CLEF_FROM_SCHEMA, JEV_RECORDED } from "./systemOne/fixtures";
import {
  ProviderError,
  aiBindingTransport,
  cloudflareRestTransport,
  createSystemOneProvider,
  httpSystemOneProvider,
  httpTransport,
  type Transport,
} from "./systemOne";

const crisis: Question = { id: "crisis", kind: "yesno", text: "Harm?" };
const pick: Question = { id: "pick", kind: "choice", text: "Which?", options: ["pizza", "sushi"] };

/** A Workers AI binding that records its calls and answers like Clef. */
function fakeAi() {
  const calls: [string, unknown][] = [];
  return {
    calls,
    async run(model: string, input: unknown) {
      calls.push([model, input]);
      return CLEF_FROM_SCHEMA;
    },
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const codeOf = async (p: Promise<unknown> | (() => unknown)) => {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (e) {
    return e instanceof ProviderError ? e.code : "other";
  }
  return "none";
};

describe("createSystemOneProvider", () => {
  it("encodes, calls the transport once and decodes", async () => {
    const transport = vi.fn<Transport>(async () => CLEF_FROM_SCHEMA);
    const provider = createSystemOneProvider({ name: "x", model: "clef-flash", transport });
    const answers = await provider.decide("a state", [crisis, pick]);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]![0]).toMatchObject({ model: "clef-flash", state: "a state" });
    expect(answers.map((a) => a.id)).toEqual(["crisis", "pick"]);
  });

  it("times out, aborts the request, and reports a generic timeout", async () => {
    let aborted = false;
    const transport: Transport = (_req, signal) =>
      new Promise((_, reject) => signal.addEventListener("abort", () => ((aborted = true), reject(new Error("x")))));
    const provider = createSystemOneProvider({ name: "x", model: "m", transport, timeoutMs: 20 });
    expect(await codeOf(provider.decide("s", [pick]))).toBe("timeout");
    expect(aborted).toBe(true);
  });

  it("wraps a transport crash so no raw error text escapes", async () => {
    const transport: Transport = async () => {
      throw new Error("secret user text: pizza");
    };
    const provider = createSystemOneProvider({ name: "x", model: "m", transport });
    const error = await provider.decide("s", [pick]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).message).not.toContain("pizza");
  });
});

describe("transports", () => {
  it("aiBindingTransport runs the model path with the request body", async () => {
    const run = vi.fn(async () => CLEF_FROM_SCHEMA);
    const transport = aiBindingTransport({ run }, "@cf/cloudflare/clef-flash");
    const request = { model: "clef-flash", state: "s", questions: {} };
    expect(await transport(request, new AbortController().signal)).toBe(CLEF_FROM_SCHEMA);
    expect(run).toHaveBeenCalledWith("@cf/cloudflare/clef-flash", request);
  });

  it("cloudflareRestTransport posts to the account's run endpoint and unwraps `result`", async () => {
    const fetch = vi.fn(async () => json({ success: true, errors: [], result: CLEF_FROM_SCHEMA }));
    const transport = cloudflareRestTransport({
      accountId: "acct",
      apiToken: "tok",
      modelPath: "@cf/cloudflare/clef-flash",
      fetch,
    });
    const result = await transport({ model: "clef-flash", state: "s", questions: {} }, new AbortController().signal);
    expect(result).toEqual(CLEF_FROM_SCHEMA);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/cloudflare/clef-flash");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "clef-flash" });
  });

  it("cloudflareRestTransport reports an unsuccessful envelope as an http error", async () => {
    const signal = new AbortController().signal;
    const mk = (res: () => Response) =>
      cloudflareRestTransport({ accountId: "a", apiToken: "t", modelPath: "m", fetch: async () => res() });
    const request = { model: "m", state: "s", questions: {} };
    expect(await codeOf(mk(() => json({ success: false, errors: [{ message: "nope" }] }, 200))(request, signal))).toBe("http");
    expect(await codeOf(mk(() => json({ success: false }, 401))(request, signal))).toBe("http");
  });

  it("httpTransport sends a bearer key and maps failures to generic errors", async () => {
    const signal = new AbortController().signal;
    const request = { model: "m", state: "s", questions: {} };
    const fetch = vi.fn(async () => json(JEV_RECORDED));
    expect(await httpTransport({ url: "https://h.test/x", apiKey: "k", fetch })(request, signal)).toEqual(JEV_RECORDED);
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k");

    expect(await codeOf(httpTransport({ url: "https://h.test", apiKey: "k", fetch: async () => json({}, 500) })(request, signal))).toBe("http");
    expect(await codeOf(httpTransport({ url: "https://h.test", apiKey: "k", fetch: async () => new Response("<html>") })(request, signal))).toBe("malformed");
  });

  it("httpSystemOneProvider refuses a key over plain http, except locally", () => {
    const make = (url: string) => () => httpSystemOneProvider({ name: "x", url, apiKey: "k", model: "m" });
    expect(make("http://example.com/v1")).toThrow(ProviderError);
    expect(make("not a url")).toThrow(ProviderError);
    expect(make("https://example.com/v1")).not.toThrow();
    expect(make("http://localhost:9000/v1")).not.toThrow();
  });
});

describe("clefProvider", () => {
  it("prefers the AI binding and calls the clef-flash model", async () => {
    const run = fakeAi();
    const provider = clefProvider({ AI: run, CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "t" });
    expect(provider.name).toBe("clef");
    await provider.decide("s", [crisis, pick]);
    expect(run.calls[0]![0]).toBe("@cf/cloudflare/clef-flash");
    expect(run.calls[0]![1]).toMatchObject({ model: "clef-flash", state: "s" });
  });

  it("can select the larger model", async () => {
    const run = fakeAi();
    await clefProvider({ AI: run, CLEF_MODEL: "clef" }).decide("s", [pick]);
    expect(run.calls[0]![0]).toBe("@cf/cloudflare/clef");
    expect(run.calls[0]![1]).toMatchObject({ model: "clef" });
  });

  it("falls back to REST outside a Worker", () => {
    expect(clefProvider({ CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "t" }).name).toBe("clef");
  });

  it("explains what is missing, naming no secret values", () => {
    expect(() => clefProvider({})).toThrow(/AI binding/);
    expect(() => clefProvider({ AI: { run: vi.fn() }, CLEF_MODEL: "gpt" })).toThrow(/CLEF_MODEL/);
  });
});

describe("jevProvider", () => {
  it("needs a key", () => {
    expect(() => jevProvider({})).toThrow(/JEV_API_KEY/);
  });

  it("targets TypeSafe by default and can be pointed at a gateway", async () => {
    const calls: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push(`${url} ${(JSON.parse(init.body as string) as { model: string }).model}`);
      return json(JEV_RECORDED);
    }) as typeof fetch;
    try {
      await jevProvider({ JEV_API_KEY: "k" }).decide("s", [{ id: "is_bug", kind: "yesno", text: "?" }]);
      await jevProvider({
        JEV_API_KEY: "k",
        JEV_BASE_URL: "https://openrouter.ai/api/alpha/decisions",
        JEV_MODEL: "typesafe/jev-1.14",
      }).decide("s", [{ id: "is_bug", kind: "yesno", text: "?" }]);
    } finally {
      globalThis.fetch = real;
    }
    expect(calls).toEqual([
      "https://api.typesafe.ai/v1/systemone jev-latest",
      "https://openrouter.ai/api/alpha/decisions typesafe/jev-1.14",
    ]);
  });
});

describe("registry", () => {
  it("lists mock, clef and jev, and selects by name", () => {
    expect(Object.keys(decisionProviders).sort()).toEqual(["clef", "jev", "mock"]);
    expect(getDecisionProvider({}).name).toBe("mock");
    expect(getDecisionProvider({ DECISION_PROVIDER: "jev", JEV_API_KEY: "k" }).name).toBe("jev");
  });

  it("rejects an unknown name, including inherited object keys", () => {
    expect(() => getDecisionProvider({ DECISION_PROVIDER: "nope" })).toThrow(/Known: mock, clef, jev/);
    expect(() => getDecisionProvider({ DECISION_PROVIDER: "constructor" })).toThrow(/Unknown/);
  });

  it("a misconfigured provider is a 500 'misconfigured', never a pick", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = await import("../app").then((m) => m.createApp());
    const res = await app.request("/api/decide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ options: ["a", "b"] }),
    }, { DECISION_PROVIDER: "jev" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "misconfigured" });
  });
});

describe("a System One provider inside the gate", () => {
  /** A fake Clef that answers from a table keyed by question id. */
  function fakeClef(answers: Record<string, unknown>): DecisionProvider {
    return createSystemOneProvider({ name: "clef", model: "clef-flash", transport: async () => ({ answers }) });
  }
  const tierAnswer = (small: number, medium: number, big: number, gated: number) => ({
    type: "choice",
    probabilities: { small, medium, big, gated },
  });

  it("classifies through the real codec", async () => {
    const provider = fakeClef({ crisis: { type: "noul", noul: 0.01 }, tier: tierAnswer(0.9, 0.05, 0.03, 0.02) });
    expect(await classify(provider, { options: ["pizza", "sushi"] })).toEqual({ tier: "small", crisis: false });
  });

  it("fails closed when the provider drops the tier answer or sends garbage", async () => {
    const dropped = fakeClef({ crisis: { type: "noul", noul: 0.01 } });
    await expect(classify(dropped, { options: ["a", "b"] })).rejects.toThrow();
    const garbage = fakeClef({ crisis: { type: "noul", noul: 0.01 }, tier: { type: "choice", probabilities: "x" } });
    await expect(classify(garbage, { options: ["a", "b"] })).rejects.toThrow();
  });

  it("returns 422 for a gated decision end to end, and 503 when the provider is down", async () => {
    const gated = fakeClef({
      crisis: { type: "noul", noul: 0.01 },
      tier: tierAnswer(0.02, 0.03, 0.05, 0.9),
      pick: { type: "choice", probabilities: { a: 0.8, b: 0.2 } },
    });
    const refused = await post("/api/decide", { options: ["a", "b"], tier: "small" }, { decision: gated });
    expect(refused.status).toBe(422);

    const down = createSystemOneProvider({
      name: "clef",
      model: "clef-flash",
      transport: async () => {
        throw new Error("offline");
      },
    });
    const failed = await post("/api/decide", { options: ["a", "b"] }, { decision: down });
    expect(failed.status).toBe(503);
    expect(await failed.json()).not.toHaveProperty("pick");
  });
});
