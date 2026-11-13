import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { ClassifyResponse, DecideResponse, Tier } from "@snap/shared";
import App from "../App";

type Reply = { status?: number; body: unknown };
type Handler = (body: Record<string, unknown>) => Reply | Promise<Reply>;
export type Handlers = Partial<Record<"/api/classify" | "/api/decide" | "/api/explain", Handler>>;
export type Call = { path: string; body: Record<string, unknown> };

/** Replaces fetch with a table of route handlers and records every call. */
export function mockApi(handlers: Handlers): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push({ path: url, body });
      const handler = handlers[url as keyof Handlers];
      const reply = handler ? await handler(body) : { status: 404, body: { error: "not_found" } };
      return new Response(JSON.stringify(reply.body), {
        status: reply.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

export function classified(tier: Tier, crisis = false): Reply {
  const body: ClassifyResponse = { tier, crisis };
  return { body };
}

export function decided(ranked: [string, number][], tier: Tier = "small"): Reply {
  const body: DecideResponse = {
    tier,
    ranked: ranked.map(([option, probability]) => ({ option, probability })),
    pick: ranked[0]![0],
    runnerUp: ranked[1]![0],
    closeCall: (ranked[0]![1] - ranked[1]![1]) * 100 < 10 - 1e-9,
    provider: "mock",
  };
  return { body };
}

export function reasoned(reason: string): Reply {
  return { body: { mode: "reason", reason } };
}

export function renderApp() {
  const user = userEvent.setup();
  render(<App />);
  return user;
}

/** Types the options (adding fields as needed) and an optional context, then taps Decide. */
export async function ask(user: ReturnType<typeof userEvent.setup>, options: string[], context?: string) {
  for (let i = 0; i < options.length; i++) {
    if (i >= 2) await user.click(screen.getByRole("button", { name: "+ Add option" }));
    const field = screen.getByLabelText(`Option ${i + 1}`);
    await user.clear(field);
    if (options[i]) await user.type(field, options[i]!);
  }
  if (context) await user.type(screen.getByLabelText("Context (optional)"), context);
  await user.click(screen.getByRole("button", { name: "Decide" }));
}
