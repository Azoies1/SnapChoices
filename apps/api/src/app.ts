import { Hono, type Context } from "hono";
import type { ClassifyResponse, DecideResponse, DecisionProvider, ExplainResponse } from "@snap/shared";
import { classify } from "./classify";
import { pickOption } from "./decide";
import { explainGate, explainQuestion, explainReason, type TextProvider } from "./explain";
import { parseInput } from "./input";
import { ProviderError, getDecisionProvider, getTextProvider, type Env } from "./providers";

export type Deps = {
  /** Override the providers chosen by the environment. Used by tests. */
  decision?: DecisionProvider;
  text?: TextProvider;
};

/** 422 for a decision that must not receive a pick. Null when a pick is allowed. */
function refusal(c: Context, classification: ClassifyResponse) {
  if (classification.crisis) return c.json({ error: "crisis" }, 422);
  if (classification.tier === "gated") return c.json({ error: "gated" }, 422);
  return null;
}

export function createApp(deps: Deps = {}) {
  const app = new Hono<{ Bindings: Env }>();
  const decision = (env: Env | undefined) => deps.decision ?? getDecisionProvider(env ?? {});
  const text = (env: Env | undefined) => deps.text ?? getTextProvider(env ?? {});

  app.get("/api/health", (c) => c.json({ ok: true, provider: decision(c.env).name }));

  app.post("/api/classify", async (c) => {
    const parsed = parseInput(await c.req.json().catch(() => null));
    if (!parsed.ok) return c.json({ error: parsed.error, message: parsed.message }, 400);
    try {
      return c.json(await classify(decision(c.env), parsed.input));
    } catch {
      return c.json({ error: "classification_failed" }, 503);
    }
  });

  app.post("/api/decide", async (c) => {
    // Any `tier` the client sends is never read: parseInput drops it and the Worker re-classifies.
    const parsed = parseInput(await c.req.json().catch(() => null));
    if (!parsed.ok) return c.json({ error: parsed.error, message: parsed.message }, 400);
    const provider = decision(c.env);

    // Both calls run in parallel for speed; the pick is held back until classification passes.
    const [classification, ranking] = await Promise.allSettled([
      classify(provider, parsed.input),
      pickOption(provider, parsed.input),
    ]);

    if (classification.status === "rejected") return c.json({ error: "classification_failed" }, 503);
    const refused = refusal(c, classification.value);
    if (refused) return refused;
    if (ranking.status === "rejected") return c.json({ error: "decision_failed" }, 502);

    const body: DecideResponse = {
      tier: classification.value.tier,
      ...ranking.value,
      provider: provider.name,
    };
    return c.json(body);
  });

  app.post("/api/explain", async (c) => {
    const raw: unknown = await c.req.json().catch(() => null);
    const parsed = parseInput(raw);
    if (!parsed.ok) return c.json({ error: parsed.error, message: parsed.message }, 400);
    const { mode, pick } = raw as { mode?: unknown; pick?: unknown };
    if (mode !== "reason" && mode !== "question" && mode !== "gate") {
      return c.json({ error: "invalid_mode", message: "Unknown explain mode." }, 400);
    }
    if (mode === "reason" && (typeof pick !== "string" || !parsed.input.options.includes(pick.trim()))) {
      return c.json({ error: "invalid_pick", message: "The pick must be one of the options." }, 400);
    }

    // Every mode is re-classified here; nothing the client says about the tier is trusted.
    let classification: ClassifyResponse;
    try {
      classification = await classify(decision(c.env), parsed.input);
    } catch {
      return c.json({ error: "classification_failed" }, 503);
    }

    let body: ExplainResponse;
    if (mode === "gate") {
      // A crisis gets no gate questions, and gate questions exist only for gated decisions.
      if (classification.crisis) return c.json({ error: "crisis" }, 422);
      if (classification.tier !== "gated") {
        return c.json({ error: "not_gated", message: "Gate questions are only for gated decisions." }, 400);
      }
      body = { mode, questions: await explainGate(text(c.env), parsed.input) };
    } else {
      // A reason or a clarifying question leads to a pick, so both are gated exactly like the pick.
      const refused = refusal(c, classification);
      if (refused) return refused;
      body =
        mode === "reason"
          ? { mode, reason: await explainReason(text(c.env), parsed.input, (pick as string).trim()) }
          : { mode, ...(await explainQuestion(text(c.env), parsed.input)) };
    }
    return c.json(body);
  });

  // Privacy rule: never log request bodies or model output. Errors report a code only.
  app.onError((err, c) => {
    if (err instanceof ProviderError && err.code === "config") {
      // Config messages name settings, never user data, so they are safe to log and help the operator.
      console.error(err.message);
      return c.json({ error: "misconfigured" }, 500);
    }
    return c.json({ error: "internal" }, 500);
  });
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  return app;
}
