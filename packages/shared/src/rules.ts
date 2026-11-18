import { TIERS, type RankedOption, type Tier } from "./types";

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
export const MAX_OPTION_LENGTH = 80;
export const MAX_CONTEXT_LENGTH = 200;
/** Follow-up nudges after a pick: how many, and how long each may be. */
export const MAX_NUDGES = 3;
export const MAX_NUDGE_LENGTH = 200;

/** Top two within this many percentage points is a close call. */
export const CLOSE_CALL_POINTS = 10;
/** Below this, the model's top tier is not trusted on its own. */
export const TIER_CONFIDENCE_FLOOR = 0.6;
/** P(yes) on the crisis question at or above this is treated as a crisis. Deliberately below 0.5. */
export const CRISIS_THRESHOLD = 0.35;

// ---------- Option validation ----------

export type OptionsError = "invalid" | "too_few" | "too_many" | "empty" | "duplicate" | "too_long";

export type OptionsResult =
  | { ok: true; options: string[] }
  | { ok: false; error: OptionsError; message: string };

export function validateOptions(raw: unknown): OptionsResult {
  if (!Array.isArray(raw) || raw.some((o) => typeof o !== "string")) {
    return { ok: false, error: "invalid", message: "Options must be a list of text." };
  }
  const options = (raw as string[]).map((o) => o.trim().replace(/\s+/g, " "));
  if (options.length < MIN_OPTIONS) {
    return { ok: false, error: "too_few", message: `Add at least ${MIN_OPTIONS} options.` };
  }
  if (options.length > MAX_OPTIONS) {
    return { ok: false, error: "too_many", message: `${MAX_OPTIONS} options at most.` };
  }
  if (options.some((o) => o.length === 0)) {
    return { ok: false, error: "empty", message: "Fill in or remove the empty option." };
  }
  if (options.some((o) => o.length > MAX_OPTION_LENGTH)) {
    return {
      ok: false,
      error: "too_long",
      message: `Keep each option under ${MAX_OPTION_LENGTH} characters.`,
    };
  }
  const seen = new Set<string>();
  for (const o of options) {
    const key = o.toLowerCase();
    if (seen.has(key)) {
      return { ok: false, error: "duplicate", message: `"${o}" is in there twice.` };
    }
    seen.add(key);
  }
  return { ok: true, options };
}

// ---------- Keyword backstops ----------

function normalise(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'");
}

/**
 * A match forces the gated tier whatever the model returns. Broad on purpose:
 * a false match costs one gate screen, a miss costs a pick on a life decision.
 */
export const GATE_PATTERNS: RegExp[] = [
  // work
  /\bresign/,
  /\bquit(ting)? (my |the |this )?(job|career|work)\b/,
  /\bleav(e|ing) (my |the |this )?(job|career)\b/,
  /\bhand(ing)? in my notice\b/,
  /\bdrop(ping)? out\b/,
  // marriage and children
  /\bdivorc/,
  /\b(marry|marriage|married|engagement|elope)\b/,
  /\bleav(e|ing) (my |the )?(husband|wife|spouse|partner|marriage)\b/,
  /\bpregnan/,
  /\babortion\b/,
  /\bivf\b/,
  /\b(have|having) (a baby|a child|kids|children|another (baby|child|kid))\b/,
  /\badopt(ing)? (a |another )?(child|baby|kid)\b/,
  // medical
  /\bdiagnos/,
  /\bsurger/,
  /\bchemo/,
  /\bbiopsy\b/,
  /\b(stop|start|refuse|continue|quit|skip)\w* (taking )?(my |the )?(treatment|medication|meds|antidepressants?|insulin|therapy)\b/,
  // legal
  /\blawsuit/,
  /\b(sue|suing)\b/,
  /\bcustody\b/,
  /\bplead(ing)? guilty\b/,
  /\bplea deal\b/,
  // major money
  /\bmortgage/,
  /\bbankrupt/,
  /\b(life|retirement) savings\b/,
  /\b401\(?k\)?\b/,
  /\bbuy(ing)? (a |the |this )?(house|home|flat|condo)\b/,
  // moving countries
  /\bimmigrat/,
  /\bemigrat/,
  /\bmov(e|ing) (abroad|overseas|countries|to another country)\b/,
  /\bcitizenship\b/,
];

/** A match means no pick and no gate questions, only the support message. */
export const CRISIS_PATTERNS: RegExp[] = [
  /\bsuicid/,
  /\bkill(ing)? (myself|him|her|them|someone|somebody|everyone)\b/,
  /\bend(ing)? my (own )?life\b/,
  /\btak(e|ing) my (own )?life\b/,
  /\bend(ing)? it all\b/,
  /\b(hurt|harm)(ing)? (myself|him|her|them|someone|somebody)\b/,
  /\bself[- ]?harm/,
  /\boverdos/,
  /\b(don't|do not|dont) want to (live|be alive|be here anymore|wake up)\b/,
  /\bnot worth living\b/,
  /\bbetter off (dead|without me)\b/,
];

export function matchesGateKeyword(text: string): boolean {
  const t = normalise(text);
  return GATE_PATTERNS.some((p) => p.test(t));
}

export function matchesCrisisKeyword(text: string): boolean {
  const t = normalise(text);
  return CRISIS_PATTERNS.some((p) => p.test(t));
}

// ---------- Tier rules ----------

function clean(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}

/** The later of two tiers in small < medium < big < gated. */
export function higherTier(a: Tier, b: Tier): Tier {
  return TIERS.indexOf(a) >= TIERS.indexOf(b) ? a : b;
}

/**
 * Fail-closed tier resolution: if the model's top tier has under 60% of the
 * probability, take the higher of its top two tiers. Returns null when the
 * probabilities are unusable, which callers must treat as a failed classification.
 */
export function resolveTier(probabilities: Record<string, number>): Tier | null {
  const raw = TIERS.map((tier) => ({ tier, p: clean(probabilities[tier]) }));
  const total = raw.reduce((sum, r) => sum + r.p, 0);
  if (total <= 0) return null;
  const ranked = raw.map((r) => ({ tier: r.tier, p: r.p / total })).sort((a, b) => b.p - a.p);
  const [top, second] = ranked as [(typeof ranked)[number], (typeof ranked)[number]];
  if (top.p >= TIER_CONFIDENCE_FLOOR) return top.tier;
  return higherTier(top.tier, second.tier);
}

// ---------- Pick rules ----------

export function isCloseCall(top: number, second: number): boolean {
  // The epsilon keeps an exact 10-point gap (0.55 vs 0.45) out of close-call territory.
  return (top - second) * 100 < CLOSE_CALL_POINTS - 1e-9;
}

export type Ranking = {
  ranked: RankedOption[];
  pick: string;
  runnerUp: string;
  closeCall: boolean;
};

/**
 * Normalises a provider's probabilities over the user's options and ranks them.
 * Returns null when no option received any probability.
 */
export function rankOptions(options: string[], probabilities: Record<string, number>): Ranking | null {
  const raw = options.map((option) => ({ option, p: clean(probabilities[option]) }));
  const total = raw.reduce((sum, r) => sum + r.p, 0);
  if (options.length < MIN_OPTIONS || total <= 0) return null;
  const ranked = raw
    .map((r) => ({ option: r.option, probability: r.p / total }))
    .sort((a, b) => b.probability - a.probability);
  const [first, second] = ranked as [RankedOption, RankedOption];
  return {
    ranked,
    pick: first.option,
    runnerUp: second.option,
    closeCall: isCloseCall(first.probability, second.probability),
  };
}

/** Used by the Worker when the text model fails twice, and by the client if the call itself fails. */
export const GATE_FALLBACK_QUESTIONS = [
  "A year from now, what would you want to be true whichever way this goes?",
  "Who else does this affect, and what have they said about it?",
  "What would you need to know to feel settled, and who could help you find out?",
];
