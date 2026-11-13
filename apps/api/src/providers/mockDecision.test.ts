import { describe, expect, it } from "vitest";
import type { Question } from "@snap/shared";
import { mockDecisionProvider as mock } from "./mockDecision";

const pick: Question = { id: "pick", kind: "choice", text: "Which?", options: ["pizza", "sushi", "tacos"] };
const tier: Question = { id: "tier", kind: "choice", text: "How big?", options: ["small", "medium", "big", "gated"] };
const crisis: Question = { id: "crisis", kind: "yesno", text: "Harm?" };

describe("mock decision provider", () => {
  it("returns one answer per question, in order, with probabilities summing to 1", async () => {
    const answers = await mock.decide("dinner", [crisis, tier, pick]);
    expect(answers.map((a) => a.id)).toEqual(["crisis", "tier", "pick"]);
    for (const a of answers) {
      const total = Object.values(a.probabilities).reduce((x, y) => x + y, 0);
      expect(total).toBeCloseTo(1);
    }
    expect(Object.keys(answers[2]!.probabilities)).toEqual(["pizza", "sushi", "tacos"]);
  });

  it("is deterministic", async () => {
    const a = await mock.decide("dinner tonight", [pick]);
    const b = await mock.decide("dinner tonight", [pick]);
    expect(a).toEqual(b);
  });

  it("classifies by keyword", async () => {
    const top = async (state: string) => {
      const [a] = await mock.decide(state, [tier]);
      return Object.entries(a!.probabilities).sort((x, y) => y[1] - x[1])[0]![0];
    };
    expect(await top("pizza or sushi")).toBe("small");
    expect(await top("which headphones")).toBe("medium");
    expect(await top("which laptop")).toBe("big");
    expect(await top("quit my job or stay")).toBe("gated");
  });

  it("answers the crisis question from the crisis keywords", async () => {
    const [yes] = await mock.decide("I want to end my life", [crisis]);
    const [no] = await mock.decide("pizza or sushi", [crisis]);
    expect(yes!.probabilities.yes).toBeGreaterThan(0.9);
    expect(no!.probabilities.yes).toBeLessThan(0.1);
  });
});
