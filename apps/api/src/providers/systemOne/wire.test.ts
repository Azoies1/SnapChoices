import { describe, expect, it } from "vitest";
import type { Question } from "@snap/shared";
import { CLEF_FROM_SCHEMA, JEV_RECORDED } from "./fixtures";
import { ProviderError, decodeAnswers, encodeRequest } from "./wire";

const crisis: Question = { id: "crisis", kind: "yesno", text: "Harm?" };
const tier: Question = {
  id: "tier",
  kind: "choice",
  text: "How big?",
  options: ["small", "medium", "big", "gated"],
};
const pick: Question = { id: "pick", kind: "choice", text: "Which?", options: ["pizza", "sushi"] };

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof ProviderError ? e.code : "other";
  }
  return "none";
};

describe("encodeRequest", () => {
  it("builds the documented System One body", () => {
    expect(encodeRequest("clef-flash", "state text", [crisis, pick])).toEqual({
      model: "clef-flash",
      state: "state text",
      questions: {
        crisis: { type: "noul", instructions: "Harm?" },
        pick: { type: "choice", instructions: "Which?", criteria: { pizza: null, sushi: null } },
      },
    });
  });

  it("uses the user's option text as the choice key, whatever characters it has", () => {
    const q: Question = { id: "pick", kind: "choice", text: "?", options: ["a/b: \"c\"", "日本", "__proto__"] };
    const body = encodeRequest("m", "s", [q]);
    const criteria = (body.questions.pick as { criteria: Record<string, null> }).criteria;
    expect(Object.keys(criteria)).toEqual(["a/b: \"c\"", "日本", "__proto__"]);
    expect(JSON.parse(JSON.stringify(body)).questions.pick.criteria).toHaveProperty("日本", null);
  });

  it("rejects bad requests before anything is sent", () => {
    expect(codeOf(() => encodeRequest("m", "s", []))).toBe("request");
    expect(codeOf(() => encodeRequest("m", "s", [crisis, crisis]))).toBe("request");
    expect(codeOf(() => encodeRequest("m", "s", [{ ...crisis, id: "has space" }]))).toBe("request");
    expect(codeOf(() => encodeRequest("m", "s", [{ ...pick, options: ["only"] }]))).toBe("request");
    expect(codeOf(() => encodeRequest("m", "s", [{ ...pick, options: ["a", "a"] }]))).toBe("request");
    expect(codeOf(() => encodeRequest("m", "s", [{ ...pick, options: ["a", ""] }]))).toBe("request");
  });
});

describe("decodeAnswers", () => {
  it("reads a real recorded Jev response (noul and choice)", () => {
    const request = encodeRequest("typesafe/jev-1.13", "ticket", [
      { id: "is_bug", kind: "yesno", text: "Is it a bug?" },
      { id: "team", kind: "choice", text: "Which team?", options: ["payments", "frontend", "account"] },
    ]);
    const [bug, team] = decodeAnswers(request, JEV_RECORDED);
    expect(bug).toEqual({ id: "is_bug", probabilities: { yes: 0.96, no: expect.closeTo(0.04) } });
    expect(team).toEqual({ id: "team", probabilities: { payments: 0.78, frontend: 0.22, account: 0 } });
  });

  it("reads a Clef response built from its published schema, in the order asked", () => {
    const request = encodeRequest("clef-flash", "s", [crisis, tier, pick]);
    const answers = decodeAnswers(request, CLEF_FROM_SCHEMA);
    expect(answers.map((a) => a.id)).toEqual(["crisis", "tier", "pick"]);
    expect(answers[1]!.probabilities).toEqual({ small: 0.86, medium: 0.1, big: 0.03, gated: 0.01 });
    expect(answers[2]!.probabilities).toEqual({ pizza: 0.4, sushi: 0.6 });
  });

  it("leaves out a question the provider did not answer, so callers fail closed", () => {
    const request = encodeRequest("m", "s", [crisis, tier]);
    const answers = decodeAnswers(request, { answers: { crisis: { type: "noul", noul: 0.1 } } });
    expect(answers.map((a) => a.id)).toEqual(["crisis"]);
  });

  it("treats an option the provider left out as 0 and ignores options it invented", () => {
    const request = encodeRequest("m", "s", [pick]);
    const [answer] = decodeAnswers(request, {
      answers: { pick: { type: "choice", probabilities: { pizza: 0.9, calzone: 0.1 } } },
    });
    expect(answer!.probabilities).toEqual({ pizza: 0.9, sushi: 0 });
  });

  it("tolerates rounding just over 1", () => {
    const request = encodeRequest("m", "s", [crisis]);
    const [answer] = decodeAnswers(request, { answers: { crisis: { type: "noul", noul: 1.0000001 } } });
    expect(answer!.probabilities).toEqual({ yes: 1, no: 0 });
  });

  it.each([
    ["not an object", "nope"],
    ["no answers", { model: "x" }],
    ["answers is a list", { answers: [] }],
    ["wrong type for a noul", { answers: { crisis: { type: "choice", choice: "yes", probabilities: {} } } }],
    ["noul not a number", { answers: { crisis: { type: "noul", noul: "0.9" } } }],
    ["noul out of range", { answers: { crisis: { type: "noul", noul: 1.5 } } }],
    ["noul negative", { answers: { crisis: { type: "noul", noul: -0.1 } } }],
    ["noul NaN", { answers: { crisis: { type: "noul", noul: Number.NaN } } }],
    ["answer is null", { answers: { crisis: null } }],
  ])("throws malformed for %s", (_label, response) => {
    const request = encodeRequest("m", "s", [crisis]);
    expect(codeOf(() => decodeAnswers(request, response))).toBe("malformed");
  });

  it.each([
    ["wrong type", { type: "noul", noul: 0.5 }],
    ["no probabilities", { type: "choice", choice: "pizza" }],
    ["a bad probability", { type: "choice", probabilities: { pizza: "high", sushi: 0.2 } }],
    ["all zero", { type: "choice", probabilities: { pizza: 0, sushi: 0 } }],
    ["nothing for our options", { type: "choice", probabilities: { calzone: 1 } }],
  ])("throws malformed for a choice with %s", (_label, answer) => {
    const request = encodeRequest("m", "s", [pick]);
    expect(codeOf(() => decodeAnswers(request, { answers: { pick: answer } }))).toBe("malformed");
  });
});
