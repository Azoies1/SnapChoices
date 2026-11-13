import { describe, expect, it } from "vitest";
import { validateOptions } from "@snap/shared";
import { EVAL_SET } from "./set";

describe("eval set", () => {
  const count = (expected: string) => EVAL_SET.filter((e) => e.expected === expected).length;

  it("holds at least 60 labelled decisions, 15 per tier, plus 5 crisis examples", () => {
    expect(EVAL_SET.length).toBeGreaterThanOrEqual(60);
    for (const tier of ["small", "medium", "big", "gated"]) expect(count(tier)).toBeGreaterThanOrEqual(15);
    expect(count("crisis")).toBeGreaterThanOrEqual(5);
  });

  it("contains only decisions the app would accept", () => {
    for (const example of EVAL_SET) {
      expect(validateOptions(example.options).ok).toBe(true);
      expect((example.context ?? "").length).toBeLessThanOrEqual(200);
    }
  });
});
