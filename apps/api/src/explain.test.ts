import { describe, expect, it } from "vitest";
import { REASON_FALLBACK, validateReason, type TextProvider } from "./explain";
import { post } from "./test/helpers";

function textStub(outputs: unknown[]): TextProvider & { calls: number } {
  const stub = {
    name: "text-stub",
    calls: 0,
    async generate() {
      const out = outputs[Math.min(stub.calls, outputs.length - 1)];
      stub.calls++;
      if (out instanceof Error) throw out;
      return out;
    },
  };
  return stub;
}

const body = { mode: "reason", options: ["pizza", "sushi"], pick: "sushi" };

describe("validateReason", () => {
  it("accepts one short sentence", () => {
    expect(validateReason({ reason: " Sushi fits a light dinner. " })).toBe("Sushi fits a light dinner.");
  });

  it("rejects 25 words or more, multiple lines, and the wrong shape", () => {
    expect(validateReason({ reason: Array(25).fill("word").join(" ") })).toBeNull();
    expect(validateReason({ reason: Array(24).fill("word").join(" ") })).not.toBeNull();
    expect(validateReason({ reason: "one\ntwo" })).toBeNull();
    expect(validateReason({ reason: "" })).toBeNull();
    expect(validateReason("Sushi.")).toBeNull();
    expect(validateReason(null)).toBeNull();
  });
});

describe("POST /api/explain, reason mode", () => {
  it("returns a one-line reason from the mock text provider", async () => {
    const res = await post("/api/explain", body);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { mode: string; reason: string };
    expect(json.mode).toBe("reason");
    expect(json.reason).toContain("sushi");
  });

  it("retries once on a validation failure", async () => {
    const text = textStub([{ nope: true }, { reason: "Sushi suits tonight." }]);
    const res = await post("/api/explain", body, { text });
    expect(((await res.json()) as { reason: string }).reason).toBe("Sushi suits tonight.");
    expect(text.calls).toBe(2);
  });

  it("falls back to a fixed string after two failures", async () => {
    const text = textStub([new Error("down"), { reason: "" }]);
    const res = await post("/api/explain", body, { text });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { reason: string }).reason).toBe(REASON_FALLBACK);
    expect(text.calls).toBe(2);
  });

  it("rejects a pick that is not one of the options, and unknown modes", async () => {
    expect((await post("/api/explain", { ...body, pick: "ramen" })).status).toBe(400);
    expect((await post("/api/explain", { ...body, mode: "essay" })).status).toBe(400);
    expect((await post("/api/explain", { ...body, options: ["one"] })).status).toBe(400);
  });
});
