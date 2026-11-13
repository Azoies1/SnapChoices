import { describe, expect, it } from "vitest";
import { GATE_FALLBACK_QUESTIONS } from "@snap/shared";
import {
  QUESTION_FALLBACK,
  REASON_FALLBACK,
  validateGateQuestions,
  validateQuestion,
  validateReason,
  type TextProvider,
} from "./explain";
import { post } from "./test/helpers";

function textStub(outputs: unknown[]): TextProvider & { calls: number } {
  const stub = {
    name: "text-stub",
    calls: 0,
    async generate() {
      const out = outputs[Math.min(stub.calls, outputs.length - 1)];
      stub.calls++;
      if (out instanceof Error) throw out;
      return out;
    },
  };
  return stub;
}

const body = { mode: "reason", options: ["pizza", "sushi"], pick: "sushi" };

describe("validateReason", () => {
  it("accepts one short sentence", () => {
    expect(validateReason({ reason: " Sushi fits a light dinner. " })).toBe("Sushi fits a light dinner.");
  });

  it("rejects 25 words or more, multiple lines, and the wrong shape", () => {
    expect(validateReason({ reason: Array(25).fill("word").join(" ") })).toBeNull();
    expect(validateReason({ reason: Array(24).fill("word").join(" ") })).not.toBeNull();
    expect(validateReason({ reason: "one\ntwo" })).toBeNull();
    expect(validateReason({ reason: "" })).toBeNull();
    expect(validateReason("Sushi.")).toBeNull();
    expect(validateReason(null)).toBeNull();
  });
});

describe("POST /api/explain, reason mode", () => {
  it("returns a one-line reason from the mock text provider", async () => {
    const res = await post("/api/explain", body);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { mode: string; reason: string };
    expect(json.mode).toBe("reason");
    expect(json.reason).toContain("sushi");
  });

  it("retries once on a validation failure", async () => {
    const text = textStub([{ nope: true }, { reason: "Sushi suits tonight." }]);
    const res = await post("/api/explain", body, { text });
    expect(((await res.json()) as { reason: string }).reason).toBe("Sushi suits tonight.");
    expect(text.calls).toBe(2);
  });

  it("falls back to a fixed string after two failures", async () => {
    const text = textStub([new Error("down"), { reason: "" }]);
    const res = await post("/api/explain", body, { text });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { reason: string }).reason).toBe(REASON_FALLBACK);
    expect(text.calls).toBe(2);
  });

  it("rejects a pick that is not one of the options, and unknown modes", async () => {
    expect((await post("/api/explain", { ...body, pick: "ramen" })).status).toBe(400);
    expect((await post("/api/explain", { ...body, mode: "essay" })).status).toBe(400);
    expect((await post("/api/explain", { ...body, options: ["one"] })).status).toBe(400);
  });
});

describe("validateQuestion", () => {
  it("accepts one question with exactly 3 distinct answers", () => {
    expect(validateQuestion({ question: "What matters most?", answers: ["Price", "Sound", "Comfort"] })).toEqual({
      question: "What matters most?",
      answers: ["Price", "Sound", "Comfort"],
    });
  });

  it("rejects the wrong number of answers, duplicates, blanks and the wrong shape", () => {
    expect(validateQuestion({ question: "Q?", answers: ["a", "b"] })).toBeNull();
    expect(validateQuestion({ question: "Q?", answers: ["a", "b", "c", "d"] })).toBeNull();
    expect(validateQuestion({ question: "Q?", answers: ["a", "A", "c"] })).toBeNull();
    expect(validateQuestion({ question: "Q?", answers: ["a", " ", "c"] })).toBeNull();
    expect(validateQuestion({ question: "", answers: ["a", "b", "c"] })).toBeNull();
    expect(validateQuestion({ answers: ["a", "b", "c"] })).toBeNull();
  });
});

describe("validateGateQuestions", () => {
  const options = ["quit my job", "stay"];

  it("accepts three questions that name no option, or name them all", () => {
    const neutral = { questions: ["What do you fear most?", "Who else is affected?", "What can be undone?"] };
    expect(validateGateQuestions(neutral, options)).toHaveLength(3);
    const both = { questions: ["If you quit my job or stay, what changes?", "Who else is affected?", "What can be undone?"] };
    expect(validateGateQuestions(both, options)).toHaveLength(3);
  });

  it("rejects a question that singles out one option", () => {
    const leading = { questions: ["Why not just quit my job?", "Who else is affected?", "What can be undone?"] };
    expect(validateGateQuestions(leading, options)).toBeNull();
  });

  it("rejects anything but exactly three questions", () => {
    expect(validateGateQuestions({ questions: ["a?", "b?"] }, options)).toBeNull();
    expect(validateGateQuestions({ questions: "a?" }, options)).toBeNull();
    expect(validateGateQuestions(null, options)).toBeNull();
  });
});

describe("POST /api/explain, question mode", () => {
  const medium = { mode: "question", options: ["the Sony headphones", "the Bose headphones"] };

  it("returns one multiple-choice question with 3 answers", async () => {
    const res = await post("/api/explain", medium);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { mode: string; question: string; answers: string[] };
    expect(json.mode).toBe("question");
    expect(json.question.length).toBeGreaterThan(0);
    expect(json.answers).toHaveLength(3);
  });

  it("retries once, then falls back to a fixed question", async () => {
    const text = textStub([{ question: "Q?", answers: ["only one"] }]);
    const res = await post("/api/explain", medium, { text });
    expect(await res.json()).toEqual({ mode: "question", ...QUESTION_FALLBACK });
    expect(text.calls).toBe(2);
  });

  it("is refused with 422 for a gated or crisis decision", async () => {
    const gated = await post("/api/explain", { mode: "question", options: ["quit my job", "stay"] });
    expect(gated.status).toBe(422);
    const crisis = await post("/api/explain", { mode: "question", options: ["a", "b"], context: "suicidal" });
    expect(crisis.status).toBe(422);
    expect(await crisis.json()).toEqual({ error: "crisis" });
  });
});

describe("POST /api/explain, gate mode", () => {
  const gated = { mode: "gate", options: ["quit my job", "stay"] };

  it("returns three questions and nothing that ranks the options", async () => {
    const res = await post("/api/explain", gated);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual(["mode", "questions"]);
    expect(json.questions).toHaveLength(3);
  });

  it("falls back to fixed neutral questions when the model favours an option", async () => {
    const text = textStub([{ questions: ["Why not just stay?", "Who is affected?", "What can be undone?"] }]);
    const res = await post("/api/explain", gated, { text });
    expect(await res.json()).toEqual({ mode: "gate", questions: GATE_FALLBACK_QUESTIONS });
    expect(text.calls).toBe(2);
  });

  it("gives a crisis no gate questions", async () => {
    const res = await post("/api/explain", { mode: "gate", options: ["keep going", "end it all"] });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "crisis" });
  });

  it("is only available for gated decisions", async () => {
    const res = await post("/api/explain", { mode: "gate", options: ["pizza", "sushi"] });
    expect(res.status).toBe(400);
  });
});
