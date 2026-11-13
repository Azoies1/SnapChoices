import { describe, expect, it } from "vitest";
import type { DecideResponse } from "@snap/shared";
import { failingProvider, post, stubProvider } from "./test/helpers";

const SAFE = { crisis: { yes: 0.01, no: 0.99 }, tier: { small: 0.9, medium: 0.1 } };

describe("POST /api/decide", () => {
  it("returns sorted probabilities, the pick, the runner-up and the close-call flag", async () => {
    const decision = stubProvider({ ...SAFE, pick: { pizza: 0.2, sushi: 0.5, tacos: 0.3 } });
    const res = await post("/api/decide", { options: ["pizza", "sushi", "tacos"] }, { decision });
    expect(res.status).toBe(200);
    const body = (await res.json()) as DecideResponse;
    expect(body.pick).toBe("sushi");
    expect(body.runnerUp).toBe("tacos");
    expect(body.closeCall).toBe(false);
    expect(body.ranked.map((r) => r.option)).toEqual(["sushi", "tacos", "pizza"]);
    expect(body.provider).toBe("stub");
  });

  it("flags a close call when the top two are under 10 points apart", async () => {
    const decision = stubProvider({ ...SAFE, pick: { pizza: 0.52, sushi: 0.48 } });
    const res = await post("/api/decide", { options: ["pizza", "sushi"] }, { decision });
    expect(((await res.json()) as DecideResponse).closeCall).toBe(true);
  });

  it("asks one choice question whose options are the user's options", async () => {
    const decision = stubProvider({ ...SAFE, pick: { a: 0.7, b: 0.3 } });
    await post("/api/decide", { options: ["a", "b"], context: "tonight" }, { decision });
    const pickCall = decision.calls.find((c) => c.questions.some((q) => q.id === "pick"))!;
    expect(pickCall.questions).toHaveLength(1);
    expect(pickCall.questions[0]).toMatchObject({ kind: "choice", options: ["a", "b"] });
    expect(pickCall.state).toContain("tonight");
  });

  it("works end to end on the mock provider and is deterministic", async () => {
    const one = await (await post("/api/decide", { options: ["gym", "rest"] })).json();
    const two = await (await post("/api/decide", { options: ["gym", "rest"] })).json();
    expect(one).toEqual(two);
    expect(["gym", "rest"]).toContain((one as DecideResponse).pick);
  });

  it.each([
    [{ options: ["only"] }, "too_few"],
    [{ options: ["a", "b", "c", "d", "e"] }, "too_many"],
    [{ options: ["a", ""] }, "empty"],
    [{ options: ["a", "A"] }, "duplicate"],
    [{ options: "a,b" }, "invalid"],
    [{ options: ["a", "b"], context: "x".repeat(201) }, "invalid_context"],
    ["not json", "invalid"],
  ])("rejects %j with 400 %s", async (body, error) => {
    const res = await post("/api/decide", body);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string; message: string };
    expect(json.error).toBe(error);
    expect(json.message.length).toBeGreaterThan(0);
  });

  it("returns 502 and no pick when the provider fails or answers with nothing usable", async () => {
    const failed = await post("/api/decide", { options: ["a", "b"] }, { decision: failingProvider });
    expect(failed.status).toBeGreaterThanOrEqual(500);
    expect(await failed.json()).not.toHaveProperty("pick");

    const empty = await post("/api/decide", { options: ["a", "b"] }, { decision: stubProvider(SAFE) });
    expect(empty.status).toBe(502);
    expect(await empty.json()).not.toHaveProperty("pick");
  });
});
