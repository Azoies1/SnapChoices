import type { TextProvider } from "../explain";

/** Deterministic text provider for tests and local development. Refers only to what the user gave. */
export const mockTextProvider: TextProvider = {
  name: "mock",
  async generate(request) {
    if (request.clarifier) {
      return { reason: `You said "${request.clarifier.chosen}", and ${request.pick} fits that best.` };
    }
    return { reason: `${request.pick} edged out the rest on what you gave me.` };
  },
};
