import { describe, expect, it, vi } from "vitest";
import type { DecisionProvider, Question } from "@snap/shared";
import { classify } from "../classify";
import { post } from "../test/helpers";
import { clefProvider } from "./clef";
import { decisionProviders, getDecisionProvider } from "./index";
import { geminiProvider } from "./gemini";
import { jevProvider } from "./jev";
import { ProviderError } from "./errors";
import { CLEF_FROM_SCHEMA, JEV_RECORDED } from "./fixtures";
import { letsDecideProvider, requireHttps } from "./letsdecide";

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

describe("letsDecideProvider", () => {
  const fakeFetch = (body: unknown, status = 200) => vi.fn<typeof globalThis.fetch>(async () => json(body, status));

  it("encodes through letsdecide, calls fetch once and decodes", async () => {
    const fetch = fakeFetch(CLEF_FROM_SCHEMA);
    const provider = letsDecideProvider({ name: "x", model: "jev/jev-latest", byProvider: { jev: { apiKey: "k" } }, fetch });
    const answers = await provider.decide("a state", [crisis, pick]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(JSON.parse(init.body as string)).toEqual({
      model: "jev-latest",
      state: "a state",
      questions: {
        crisis: { type: "noul", instructions: "Harm?" },
        pick: { type: "choice", instructions: "Which?", criteria: { pizza: "", sushi: "" } },
      },
    });
    expect(answers).toEqual([
      { id: "crisis", probabilities: { yes: 0.02, no: 0.98 } },
      { id: "pick", probabilities: { pizza: 0.4, sushi: 0.6 } },
    ]);
  });

  it("sends free-text options under positional ids and maps the answer back to the text", async () => {
    const fetch = fakeFetch({ answers: { pick: { type: "choice", choice: "o1", probabilities: { o0: 0.25, o1: 0.75 } } } });
    const provider = letsDecideProvider({ name: "x", model: "jev/m", byProvider: { jev: { apiKey: "k" } }, fetch });
    const q: Question = { id: "pick", kind: "choice", text: "Which?", options: ["Thai place", "Pizza!"] };
    const answers = await provider.decide("s", [q]);
    const body = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.questions.pick.criteria).toEqual({ o0: "Thai place", o1: "Pizza!" });
    expect(answers).toEqual([{ id: "pick", probabilities: { "Thai place": 0.25, "Pizza!": 0.75 } }]);
  });

  it("treats a skipped answer as malformed, so the caller fails closed", async () => {
    const fetch = fakeFetch({ answers: { crisis: { type: "noul", noul: 0.1 } } });
    const provider = letsDecideProvider({ name: "x", model: "jev/m", byProvider: { jev: { apiKey: "k" } }, fetch });
    expect(await codeOf(provider.decide("s", [crisis, pick]))).toBe("malformed");
  });

  it("rejects an out-of-range probability as malformed", async () => {
    const fetch = fakeFetch({ answers: { crisis: { type: "noul", noul: 7 } } });
    const provider = letsDecideProvider({ name: "x", model: "jev/m", byProvider: { jev: { apiKey: "k" } }, fetch });
    expect(await codeOf(provider.decide("s", [crisis]))).toBe("malformed");
  });

  it("maps http failures to generic errors", async () => {
    const make = (status: number) =>
      letsDecideProvider({ name: "x", model: "jev/m", byProvider: { jev: { apiKey: "k" } }, fetch: fakeFetch({}, status) });
    expect(await codeOf(make(500).decide("s", [pick]))).toBe("http");
    expect(await codeOf(make(401).decide("s", [pick]))).toBe("config");
  });

  it("times out, aborts the request, and reports a generic timeout", async () => {
    let aborted = false;
    const fetch = ((_url: string, init: RequestInit) =>
      new Promise((_, reject) =>
        init.signal!.addEventListener("abort", () => ((aborted = true), reject(new Error("x")))),
      )) as unknown as typeof globalThis.fetch;
    const provider = letsDecideProvider({ name: "x", model: "jev/m", byProvider: { jev: { apiKey: "k" } }, fetch, timeoutMs: 50 });
    expect(await codeOf(provider.decide("s", [pick]))).toBe("timeout");
    expect(aborted).toBe(true);
  });

  it("wraps a fetch crash so no raw error text escapes", async () => {
    const fetch = (async () => {
      throw new Error("secret user text: pizza");
    }) as unknown as typeof globalThis.fetch;
    const provider = letsDecideProvider({ name: "x", model: "jev/m", byProvider: { jev: { apiKey: "k" } }, fetch });
    const error = await provider.decide("s", [pick]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).message).not.toContain("pizza");
  });

  it("refuses bad questions before sending", async () => {
    const fetch = fakeFetch(CLEF_FROM_SCHEMA);
    const provider = letsDecideProvider({ name: "x", model: "jev/m", byProvider: { jev: { apiKey: "k" } }, fetch });
    expect(await codeOf(provider.decide("s", []))).toBe("request");
    expect(await codeOf(provider.decide("s", [{ ...pick, options: ["a", "a"] }]))).toBe("request");
    expect(await codeOf(provider.decide("s", [{ ...pick, id: "Bad Id" }]))).toBe("request");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requireHttps refuses a key over plain http, except locally", () => {
    expect(() => requireHttps("x", "http://example.com/v1")).toThrow(ProviderError);
    expect(() => requireHttps("x", "not a url")).toThrow(ProviderError);
    expect(() => requireHttps("x", "https://example.com/v1")).not.toThrow();
    expect(() => requireHttps("x", "http://localhost:9000/v1")).not.toThrow();
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

  it("falls back to REST outside a Worker, unwrapping Cloudflare's envelope", async () => {
    const real = globalThis.fetch;
    let sent: [string, RequestInit] | undefined;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      sent = [url, init];
      return json({ success: true, errors: [], result: CLEF_FROM_SCHEMA });
    }) as typeof fetch;
    try {
      const provider = clefProvider({ CLOUDFLARE_ACCOUNT_ID: "acct", CLOUDFLARE_API_TOKEN: "tok" });
      const answers = await provider.decide("s", [crisis, pick]);
      expect(answers.find((a) => a.id === "pick")!.probabilities).toEqual({ pizza: 0.4, sushi: 0.6 });
    } finally {
      globalThis.fetch = real;
    }
    expect(sent![0]).toBe("https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/cloudflare/clef-flash");
    expect((sent![1].headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("reports an unsuccessful REST envelope as an http error", async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (async () => json({ success: false, errors: [{ message: "nope" }] }, 500)) as typeof fetch;
    try {
      const provider = clefProvider({ CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "t" });
      expect(await codeOf(provider.decide("s", [pick]))).toBe("http");
    } finally {
      globalThis.fetch = real;
    }
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

describe("geminiProvider", () => {
  it("needs a key", () => {
    expect(() => geminiProvider({})).toThrow(/GEMINI_API_KEY/);
  });

  it("sends Google's body shape with the key header and decodes the answers", async () => {
    const real = globalThis.fetch;
    let sent: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | undefined;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      sent = { url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) };
      return json({
        answers: {
          crisis: { type: "noul", noul: 0.03, confidence: 0.97 },
          pick: { type: "choice", choice: "sushi", confidence: 0.7, probabilities: { pizza: 0.3, sushi: 0.7 } },
        },
        usage: { total_output_tokens: 0 },
      });
    }) as typeof fetch;
    try {
      const answers = await geminiProvider({ GEMINI_API_KEY: "k" }).decide("s", [crisis, pick]);
      expect(answers.find((a) => a.id === "pick")!.probabilities).toEqual({ pizza: 0.3, sushi: 0.7 });
    } finally {
      globalThis.fetch = real;
    }
    expect(sent!.url).toBe("https://generativelanguage.googleapis.com/v1beta/decisions");
    expect(sent!.headers["x-goog-api-key"]).toBe("k");
    expect(sent!.body).toEqual({
      model: "gemini-decision-1",
      input: "s",
      questions: {
        crisis: { type: "noul", instructions: "Harm?" },
        pick: { type: "choice", instructions: "Which?", criteria: { pizza: "", sushi: "" } },
      },
    });
  });

  it("maps an http failure to a generic error", async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (async () => json({}, 503)) as typeof fetch;
    try {
      expect(await codeOf(geminiProvider({ GEMINI_API_KEY: "k" }).decide("s", [pick]))).toBe("http");
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe("registry", () => {
  it("lists mock, clef, jev and gemini, and selects by name", () => {
    expect(Object.keys(decisionProviders).sort()).toEqual(["clef", "gemini", "jev", "mock"]);
    expect(getDecisionProvider({}).name).toBe("mock");
    expect(getDecisionProvider({ DECISION_PROVIDER: "jev", JEV_API_KEY: "k" }).name).toBe("jev");
  });

  it("rejects an unknown name, including inherited object keys", () => {
    expect(() => getDecisionProvider({ DECISION_PROVIDER: "nope" })).toThrow(/Known: mock, clef, jev, gemini/);
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

describe("a letsdecide provider inside the gate", () => {
  /** A fake Clef binding that answers from a table keyed by question id. */
  function fakeClef(answers: Record<string, unknown>): DecisionProvider {
    return clefProvider({ AI: { run: async () => ({ answers }) } });
  }
  const tierAnswer = (small: number, medium: number, big: number, gated: number) => {
    const probabilities = { small, medium, big, gated };
    const choice = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]![0];
    return { type: "choice", choice, probabilities };
  };

  it("classifies through letsdecide's codec", async () => {
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
      pick: { type: "choice", choice: "a", probabilities: { a: 0.8, b: 0.2 } },
    });
    const refused = await post("/api/decide", { options: ["a", "b"], tier: "small" }, { decision: gated });
    expect(refused.status).toBe(422);

    const down = clefProvider({
      AI: {
        run: async () => {
          throw new Error("offline");
        },
      },
    });
    const failed = await post("/api/decide", { options: ["a", "b"] }, { decision: down });
    expect(failed.status).toBe(503);
    expect(await failed.json()).not.toHaveProperty("pick");
  });
});
