import { describe, expect, it } from "vitest";
import {
  higherTier,
  isCloseCall,
  matchesCrisisKeyword,
  matchesGateKeyword,
  rankOptions,
  resolveTier,
  validateOptions,
} from "./rules";

describe("validateOptions", () => {
  it("accepts 2 to 4 distinct options and trims them", () => {
    expect(validateOptions([" pizza ", "sushi"])).toEqual({ ok: true, options: ["pizza", "sushi"] });
    expect(validateOptions(["a", "b", "c", "d"]).ok).toBe(true);
  });

  it.each([
    [["only one"], "too_few"],
    [[], "too_few"],
    [["a", "b", "c", "d", "e"], "too_many"],
    [["a", "  "], "empty"],
    [["Pizza", "pizza "], "duplicate"],
    [["a", "x".repeat(81)], "too_long"],
    ["a,b", "invalid"],
    [["a", 3], "invalid"],
  ])("rejects %j as %s", (input, error) => {
    const result = validateOptions(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(error);
      expect(result.message.length).toBeGreaterThan(0);
    }
  });
});

describe("gate keyword backstop", () => {
  it.each([
    "file for divorce",
    "Resign on Monday",
    "quit my job",
    "wait for the diagnosis",
    "have the surgery",
    "settle the lawsuit",
    "take the 30 year mortgage",
    "immigrate to Canada",
    "have a baby next year",
    "stop taking my medication",
    "moving abroad",
    "get married in June",
  ])("matches %s", (text) => {
    expect(matchesGateKeyword(text)).toBe(true);
  });

  it.each(["pizza", "the blue headphones", "gym or rest", "watch a legal drama", "baby back ribs"])(
    "does not match %s",
    (text) => {
      expect(matchesGateKeyword(text)).toBe(false);
    },
  );
});

describe("crisis keyword backstop", () => {
  it.each([
    "kill myself",
    "I feel suicidal",
    "end my life",
    "end it all",
    "hurt someone",
    "self-harm again",
    "I don’t want to be alive",
    "take an overdose",
  ])("matches %s", (text) => {
    expect(matchesCrisisKeyword(text)).toBe(true);
  });

  it.each(["kill time at the mall", "this workout hurts", "killer tacos", "end the lease"])(
    "does not match %s",
    (text) => {
      expect(matchesCrisisKeyword(text)).toBe(false);
    },
  );
});

describe("resolveTier (fail closed)", () => {
  it("takes a confident top tier", () => {
    expect(resolveTier({ small: 0.8, medium: 0.1, big: 0.05, gated: 0.05 })).toBe("small");
    expect(resolveTier({ small: 0.6, medium: 0.4, big: 0, gated: 0 })).toBe("small");
  });

  it("takes the higher of the top two when the top is under 60%", () => {
    expect(resolveTier({ small: 0.55, medium: 0.4, big: 0.05, gated: 0 })).toBe("medium");
    expect(resolveTier({ small: 0.5, medium: 0.1, big: 0.1, gated: 0.3 })).toBe("gated");
    expect(resolveTier({ small: 0.1, medium: 0.2, big: 0.59, gated: 0.11 })).toBe("big");
  });

  it("normalises before applying the floor", () => {
    expect(resolveTier({ small: 6, medium: 4 })).toBe("small");
    expect(resolveTier({ small: 5, medium: 5 })).toBe("medium");
  });

  it("returns null when the probabilities are unusable", () => {
    expect(resolveTier({})).toBeNull();
    expect(resolveTier({ small: Number.NaN, tiny: 1 })).toBeNull();
  });

  it("orders tiers", () => {
    expect(higherTier("small", "big")).toBe("big");
    expect(higherTier("gated", "medium")).toBe("gated");
  });
});

describe("close-call rule", () => {
  it("is a close call under 10 points and not at 10 or over", () => {
    expect(isCloseCall(0.54, 0.46)).toBe(true);
    expect(isCloseCall(0.5, 0.5)).toBe(true);
    expect(isCloseCall(0.55, 0.45)).toBe(false);
    expect(isCloseCall(0.6, 0.5)).toBe(false);
    expect(isCloseCall(0.7, 0.3)).toBe(false);
  });
});

describe("rankOptions", () => {
  it("sorts, picks, and names the runner-up", () => {
    const r = rankOptions(["a", "b", "c"], { a: 0.2, b: 0.5, c: 0.3 });
    expect(r?.pick).toBe("b");
    expect(r?.runnerUp).toBe("c");
    expect(r?.closeCall).toBe(false);
    expect(r?.ranked.map((x) => x.option)).toEqual(["b", "c", "a"]);
  });

  it("normalises and flags close calls on the top two only", () => {
    const r = rankOptions(["a", "b", "c"], { a: 45, b: 40, c: 15 });
    expect(r?.closeCall).toBe(true);
    expect(r?.ranked[0]?.probability).toBeCloseTo(0.45);
  });

  it("ignores probabilities for options the user did not give", () => {
    const r = rankOptions(["a", "b"], { a: 0.2, b: 0.3, zzz: 0.5 });
    expect(r?.pick).toBe("b");
    expect(r?.ranked).toHaveLength(2);
  });

  it("returns null when nothing usable came back", () => {
    expect(rankOptions(["a", "b"], {})).toBeNull();
    expect(rankOptions(["a", "b"], { a: Number.NaN, b: -1 })).toBeNull();
  });
});
