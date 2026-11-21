/**
 * Raw provider responses the letsdecide adapter is tested against.
 *
 * JEV_RECORDED is a real response captured from the live API by OpenRouter's
 * Jev tutorial (Jev 1.13). CLEF_FROM_SCHEMA was written from Cloudflare's
 * published clef-flash output schema, because the docs show no example
 * response. Replace it with a recording the first time a real Clef call is
 * made (milestone 5).
 */

export const JEV_RECORDED = {
  id: "gen-dec-1790015143-AIaTutprXsJ5EwohRSjb",
  model: "typesafe/jev-1.13-20260917",
  provider: "TypeSafe",
  answers: {
    is_bug: { type: "noul", noul: 0.96 },
    team: {
      type: "choice",
      choice: "payments",
      confidence: 0.67,
      probabilities: { payments: 0.78, frontend: 0.22, account: 0 },
    },
    urgency: {
      type: "score",
      score: 1.99,
      confidence: 0.99,
      probabilities: { "0": 0, "1": 0, "2": 1 },
      legend: { "0": "a", "1": "b", "2": "c" },
    },
  },
  usage: { input_tokens: 476, output_tokens: 70, cost: 0.000019992 },
};

export const CLEF_FROM_SCHEMA = {
  model: "clef-flash",
  answers: {
    crisis: { type: "noul", noul: 0.02 },
    tier: {
      type: "choice",
      choice: "small",
      confidence: 0.81,
      probabilities: { small: 0.86, medium: 0.1, big: 0.03, gated: 0.01 },
    },
    pick: {
      type: "choice",
      choice: "sushi",
      confidence: 0.2,
      probabilities: { pizza: 0.4, sushi: 0.6 },
    },
  },
  usage: { input_tokens: 310, output_tokens: 42 },
};
