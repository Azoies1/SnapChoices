import type { TextProvider } from "../explain";

/** Deterministic text provider for tests and local development. Refers only to what the user gave. */
export const mockTextProvider: TextProvider = {
  name: "mock",
  async generate(request) {
    switch (request.mode) {
      case "reason":
        return request.clarifier
          ? { reason: `You said "${request.clarifier.chosen}", and ${request.pick} fits that best.` }
          : { reason: `${request.pick} edged out the rest on what you gave me.` };
      case "question":
        return {
          question: "What matters most to you here?",
          answers: ["Keeping the cost down", "Getting the best one", "The least hassle"],
        };
      case "gate":
        return {
          questions: [
            "What would you tell a close friend facing this same choice?",
            "Which parts of this could you undo later, and which could you not?",
            "Who do you trust that has been through something like this?",
          ],
        };
    }
  },
};
