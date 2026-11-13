import { rankOptions, type DecisionInput, type DecisionProvider, type Ranking } from "@snap/shared";
import { buildState } from "./input";

export class DecisionError extends Error {}

/** One decision-model call: a single choice question whose options are the user's options. */
export async function pickOption(provider: DecisionProvider, input: DecisionInput): Promise<Ranking> {
  let probabilities: Record<string, number> | undefined;
  try {
    const answers = await provider.decide(buildState(input), [
      {
        id: "pick",
        kind: "choice",
        text: "Which option should this person go with?",
        options: input.options,
      },
    ]);
    probabilities = answers.find((a) => a.id === "pick")?.probabilities;
  } catch {
    throw new DecisionError("provider_failed");
  }
  const ranking = probabilities ? rankOptions(input.options, probabilities) : null;
  if (!ranking) throw new DecisionError("unusable_answer");
  return ranking;
}
