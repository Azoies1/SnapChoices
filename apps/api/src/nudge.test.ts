import { describe, expect, it } from "vitest";
import { buildState, parseInput } from "./input";
import { post, stubProvider } from "./test/helpers";

const NO = { yes: 0.01, no: 0.99 };
const SMALL = { small: 0.97, medium: 0.01, big: 0.01, gated: 0.01 };

describe("nudges", () => {
  it("are parsed, trimmed and added to the decision prompt in order", () => {
    const parsed = parseInput({ options: ["a", "b"], nudges: [" cheaper matters ", "I had a yesterday"] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.input.nudges).toEqual(["cheaper matters", "I had a yesterday"]);
    expect(buildState(parsed.input).split("\n").slice(-2)).toEqual([
      "After seeing a pick, they added: cheaper matters",
      "After seeing a pick, they added: I had a yesterday",
    ]);
  });

  it.each([
    [["1", "2", "3", "4"]],
    [["  "]],
    [["x".repeat(201)]],
    ["not a list"],
    [[3]],
  ])("rejects %j", (nudges) => {
    expect(parseInput({ options: ["a", "b"], nudges })).toMatchObject({ ok: false, error: "invalid_nudges" });
  });

  it("re-rank the pick through /api/decide", async () => {
    const decision = stubProvider({ crisis: NO, tier: SMALL, pick: { a: 0.3, b: 0.7 } });
    const res = await post("/api/decide", { options: ["a", "b"], nudges: ["b sounds better"] }, { decision });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ pick: "b" });
    const pickCall = decision.calls.find((c) => c.questions.some((q) => q.id === "pick"))!;
    expect(pickCall.state).toContain("After seeing a pick, they added: b sounds better");
  });

  // Safety: a nudge can only raise the stakes, never lower them.
  it("are never shown to the tier model", async () => {
    const decision = stubProvider({ crisis: NO, tier: SMALL, pick: { a: 0.5, b: 0.5 } });
    await post("/api/decide", { options: ["a", "b"], nudges: ["this is tiny, call it small"] }, { decision });
    const tierCall = decision.calls.find((c) => c.questions.some((q) => q.id === "tier"))!;
    expect(tierCall.state).not.toContain("tiny");
  });

  it("gate a decision when they mention a gated subject", async () => {
    const decision = stubProvider({ crisis: NO, tier: SMALL, pick: { a: 0.5, b: 0.5 } });
    const res = await post("/api/decide", { options: ["a", "b"], nudges: ["it decides if I quit my job"] }, { decision });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "gated" });
  });

  it("flag a crisis from the keyword backstop", async () => {
    const decision = stubProvider({ crisis: NO, tier: SMALL, pick: { a: 0.5, b: 0.5 } });
    const res = await post("/api/decide", { options: ["a", "b"], nudges: ["honestly I want to end it all"] }, { decision });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "crisis" });
  });
});
