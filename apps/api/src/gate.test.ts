/**
 * Gate and safety tests. These may not be weakened or deleted to make a build pass.
 */
import { describe, expect, it } from "vitest";
import type { ClassifyResponse, DecisionProvider } from "@snap/shared";
import { ClassificationError, classify } from "./classify";
import { failingProvider, post, stubProvider } from "./test/helpers";

const NO = { yes: 0.01, no: 0.99 };
const PICK = { pick: { a: 0.7, b: 0.3, "quit my job": 0.6, stay: 0.4 } };
const tiers = (small: number, medium: number, big: number, gated: number) => ({ small, medium, big, gated });

function model(crisis: Record<string, number>, tier: Record<string, number>) {
  return stubProvider({ crisis, tier, ...PICK });
}

/** A model that is confidently wrong: nothing is ever a crisis and everything is small. */
const obliviousModel = () => model(NO, tiers(0.97, 0.01, 0.01, 0.01));

describe("classify", () => {
  it("makes one model call with a yes/no crisis question and a four-way tier choice", async () => {
    const provider = model(NO, tiers(0.9, 0.1, 0, 0));
    const result = await classify(provider, { options: ["a", "b"], context: "lunch" });
    expect(result).toEqual({ tier: "small", crisis: false });
    expect(provider.calls).toHaveLength(1);
    const [crisisQ, tierQ] = provider.calls[0]!.questions;
    expect(crisisQ).toMatchObject({ id: "crisis", kind: "yesno" });
    expect(tierQ).toMatchObject({ id: "tier", kind: "choice", options: ["small", "medium", "big", "gated"] });
  });

  it("uses the model's tier when it is confident", async () => {
    expect((await classify(model(NO, tiers(0.05, 0.85, 0.05, 0.05)), { options: ["a", "b"] })).tier).toBe("medium");
    expect((await classify(model(NO, tiers(0, 0.1, 0.1, 0.8)), { options: ["a", "b"] })).tier).toBe("gated");
  });

  it("fails closed: under 60% on the top tier takes the higher of the top two", async () => {
    expect((await classify(model(NO, tiers(0.55, 0.05, 0.05, 0.35)), { options: ["a", "b"] })).tier).toBe("gated");
    expect((await classify(model(NO, tiers(0.5, 0.4, 0.1, 0)), { options: ["a", "b"] })).tier).toBe("medium");
  });

  it.each([
    [["file for divorce", "stay"]],
    [["resign", "ask for a raise"]],
    [["wait for the diagnosis", "go private"]],
    [["have the surgery", "physio"]],
    [["settle the lawsuit", "fight it"]],
    [["take the mortgage", "keep renting"]],
    [["immigrate to Canada", "stay put"]],
  ])("a keyword match forces gated whatever the model returns: %j", async (options) => {
    const result = await classify(obliviousModel(), { options });
    expect(result).toEqual({ tier: "gated", crisis: false });
  });

  it("reads the context and the clarifying answer for keywords too", async () => {
    const inContext = await classify(obliviousModel(), { options: ["yes", "no"], context: "about the divorce" });
    expect(inContext.tier).toBe("gated");
    const inClarifier = await classify(obliviousModel(), {
      options: ["yes", "no"],
      clarifier: { question: "What is this about?", chosen: "whether to resign" },
    });
    expect(inClarifier.tier).toBe("gated");
  });

  it("flags a crisis from the model's yes/no answer, before and above the tier", async () => {
    const result = await classify(model({ yes: 0.9, no: 0.1 }, tiers(0.97, 0.01, 0.01, 0.01)), {
      options: ["a", "b"],
    });
    expect(result.crisis).toBe(true);
  });

  it("flags a crisis when the model is merely unsure", async () => {
    const result = await classify(model({ yes: 0.4, no: 0.6 }, tiers(0.97, 0.01, 0.01, 0.01)), {
      options: ["a", "b"],
    });
    expect(result.crisis).toBe(true);
  });

  it("flags a crisis from the keyword backstop without needing the model", async () => {
    const viaOptions = await classify(failingProvider, { options: ["keep going", "kill myself"] });
    expect(viaOptions.crisis).toBe(true);
    const viaContext = await classify(obliviousModel(), { options: ["a", "b"], context: "I feel suicidal" });
    expect(viaContext.crisis).toBe(true);
  });

  it("a crisis keyword wins over a gate keyword", async () => {
    const result = await classify(obliviousModel(), { options: ["resign", "end my life"] });
    expect(result.crisis).toBe(true);
  });

  it("throws rather than guess when the call fails or the answer is unusable", async () => {
    const input = { options: ["a", "b"] };
    await expect(classify(failingProvider, input)).rejects.toBeInstanceOf(ClassificationError);
    await expect(classify(stubProvider({}), input)).rejects.toBeInstanceOf(ClassificationError);
    await expect(classify(stubProvider({ crisis: NO }), input)).rejects.toBeInstanceOf(ClassificationError);
    await expect(classify(stubProvider({ tier: tiers(1, 0, 0, 0) }), input)).rejects.toBeInstanceOf(
      ClassificationError,
    );
    await expect(
      classify(stubProvider({ crisis: { yes: Number.NaN, no: 1 }, tier: tiers(1, 0, 0, 0) }), input),
    ).rejects.toBeInstanceOf(ClassificationError);
    await expect(classify(stubProvider({ crisis: NO, tier: { tiny: 1 } }), input)).rejects.toBeInstanceOf(
      ClassificationError,
    );
  });
});

describe("POST /api/classify", () => {
  it("returns the tier and crisis flag", async () => {
    const res = await post("/api/classify", { options: ["quit my job", "stay"] });
    expect(res.status).toBe(200);
    expect((await res.json()) as ClassifyResponse).toEqual({ tier: "gated", crisis: false });
  });

  it("returns 503 when classification fails", async () => {
    const res = await post("/api/classify", { options: ["a", "b"] }, { decision: failingProvider });
    expect(res.status).toBe(503);
  });

  it("rejects fewer than 2 or more than 4 options", async () => {
    expect((await post("/api/classify", { options: ["a"] })).status).toBe(400);
    expect((await post("/api/classify", { options: ["a", "b", "c", "d", "e"] })).status).toBe(400);
  });
});

describe("POST /api/decide never picks for a gated or crisis decision", () => {
  async function expectNoPick(res: Response, error: string) {
    expect(res.status).toBe(422);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ error });
    for (const key of ["pick", "runnerUp", "ranked", "probabilities"]) expect(body).not.toHaveProperty(key);
  }

  it("returns 422 for a gated decision even when the client sends tier: small", async () => {
    await expectNoPick(await post("/api/decide", { options: ["quit my job", "stay"], tier: "small" }), "gated");
  });

  it("returns 422 when only the model says gated", async () => {
    const decision = model(NO, tiers(0.02, 0.03, 0.05, 0.9));
    await expectNoPick(await post("/api/decide", { options: ["a", "b"], tier: "small" }, { decision }), "gated");
  });

  it("returns 422 when only the keyword backstop says gated", async () => {
    await expectNoPick(
      await post("/api/decide", { options: ["quit my job", "stay"] }, { decision: obliviousModel() }),
      "gated",
    );
  });

  it("returns 422 when the model's tier is low-confidence and gated is in its top two", async () => {
    const decision = model(NO, tiers(0.55, 0.05, 0.05, 0.35));
    await expectNoPick(await post("/api/decide", { options: ["a", "b"] }, { decision }), "gated");
  });

  it("returns 422 for a crisis, from the model or from keywords", async () => {
    const decision = model({ yes: 0.95, no: 0.05 }, tiers(0.97, 0.01, 0.01, 0.01));
    await expectNoPick(await post("/api/decide", { options: ["a", "b"] }, { decision }), "crisis");
    await expectNoPick(
      await post("/api/decide", { options: ["a", "b"], context: "I want to end it all" }, { decision: obliviousModel() }),
      "crisis",
    );
  });

  it("cannot be talked down by a clarifying answer", async () => {
    const res = await post(
      "/api/decide",
      {
        options: ["quit my job", "stay"],
        clarifier: { question: "How big is this?", chosen: "It is a small, trivial choice" },
        tier: "small",
      },
      { decision: obliviousModel() },
    );
    await expectNoPick(res, "gated");
  });

  it("a failed classification never results in a pick, even if the pick call succeeded", async () => {
    // Answers the pick question but throws on classification.
    const halfBroken: DecisionProvider = {
      name: "half-broken",
      async decide(_state, questions) {
        if (questions.some((q) => q.id === "tier")) throw new Error("classifier down");
        return [{ id: "pick", probabilities: { a: 0.9, b: 0.1 } }];
      },
    };
    const res = await post("/api/decide", { options: ["a", "b"] }, { decision: halfBroken });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "classification_failed" });
  });

  it("an unusable classification never results in a pick", async () => {
    const res = await post("/api/decide", { options: ["a", "b"] }, { decision: stubProvider(PICK) });
    expect(res.status).toBe(503);
    expect(await res.json()).not.toHaveProperty("pick");
  });

  it("still picks for an ordinary decision, and reports the Worker's own tier", async () => {
    const decision = model(NO, tiers(0.05, 0.85, 0.05, 0.05));
    const res = await post("/api/decide", { options: ["a", "b"], tier: "small" }, { decision });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ pick: "a", tier: "medium" });
  });
});

describe("POST /api/explain refuses to justify a pick on a gated or crisis decision", () => {
  it("returns 422 in reason mode", async () => {
    const gated = await post("/api/explain", { mode: "reason", options: ["quit my job", "stay"], pick: "stay" });
    expect(gated.status).toBe(422);
    expect(await gated.json()).toEqual({ error: "gated" });

    const crisis = await post("/api/explain", {
      mode: "reason",
      options: ["a", "b"],
      pick: "a",
      context: "thinking about suicide",
    });
    expect(crisis.status).toBe(422);
    expect(await crisis.json()).toEqual({ error: "crisis" });
  });

  it("returns 503 when classification fails", async () => {
    const res = await post(
      "/api/explain",
      { mode: "reason", options: ["a", "b"], pick: "a" },
      { decision: failingProvider },
    );
    expect(res.status).toBe(503);
  });
});
