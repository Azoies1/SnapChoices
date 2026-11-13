import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("health", () => {
  it("reports ok and the active provider", async () => {
    const res = await createApp().request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, provider: "mock" });
  });

  it("returns JSON for unknown routes", async () => {
    const res = await createApp().request("/api/nope");
    expect(res.status).toBe(404);
  });
});
