import { Hono } from "hono";
import type { DecisionProvider } from "@snap/shared";
import { getDecisionProvider, type Env } from "./providers";

export type Deps = {
  /** Overrides the provider chosen by DECISION_PROVIDER. Used by tests. */
  decision?: DecisionProvider;
};

export function createApp(deps: Deps = {}) {
  const app = new Hono<{ Bindings: Env }>();
  const decision = (env: Env | undefined) => deps.decision ?? getDecisionProvider(env ?? {});

  app.get("/api/health", (c) => c.json({ ok: true, provider: decision(c.env).name }));

  // Privacy rule: never log request bodies or model output. Errors report a code only.
  app.onError((_err, c) => c.json({ error: "internal" }, 500));
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  return app;
}
