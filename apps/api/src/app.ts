import { Hono } from "hono";
import type { DecideResponse, DecisionProvider, ExplainResponse } from "@snap/shared";
import { DecisionError, pickOption } from "./decide";
import { explainReason, type TextProvider } from "./explain";
import { parseInput } from "./input";
import { getDecisionProvider, getTextProvider, type Env } from "./providers";

export type Deps = {
  /** Override the providers chosen by the environment. Used by tests. */
  decision?: DecisionProvider;
  text?: TextProvider;
};

export function createApp(deps: Deps = {}) {
  const app = new Hono<{ Bindings: Env }>();
  const decision = (env: Env | undefined) => deps.decision ?? getDecisionProvider(env ?? {});
  const text = (env: Env | undefined) => deps.text ?? getTextProvider(env ?? {});

  app.get("/api/health", (c) => c.json({ ok: true, provider: decision(c.env).name }));

  app.post("/api/decide", async (c) => {
    const parsed = parseInput(await c.req.json().catch(() => null));
    if (!parsed.ok) return c.json({ error: parsed.error, message: parsed.message }, 400);
    const provider = decision(c.env);

    try {
      const ranking = await pickOption(provider, parsed.input);
      const body: DecideResponse = { tier: "small", ...ranking, provider: provider.name };
      return c.json(body);
    } catch (err) {
      if (err instanceof DecisionError) return c.json({ error: "decision_failed" }, 502);
      throw err;
    }
  });

  app.post("/api/explain", async (c) => {
    const raw: unknown = await c.req.json().catch(() => null);
    const parsed = parseInput(raw);
    if (!parsed.ok) return c.json({ error: parsed.error, message: parsed.message }, 400);
    const { mode, pick } = raw as { mode?: unknown; pick?: unknown };

    if (mode === "reason") {
      if (typeof pick !== "string" || !parsed.input.options.includes(pick.trim())) {
        return c.json({ error: "invalid_pick", message: "The pick must be one of the options." }, 400);
      }
      const reason = await explainReason(text(c.env), parsed.input, pick.trim());
      const body: ExplainResponse = { mode: "reason", reason };
      return c.json(body);
    }
    return c.json({ error: "invalid_mode", message: "Unknown explain mode." }, 400);
  });

  // Privacy rule: never log request bodies or model output. Errors report a code only.
  app.onError((_err, c) => c.json({ error: "internal" }, 500));
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  return app;
}
