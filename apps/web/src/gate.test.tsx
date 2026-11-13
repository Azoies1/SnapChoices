/**
 * Gate and safety tests for the interface. These may not be weakened or
 * deleted to make a build pass.
 */
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { listDecisions } from "./db";
import { ask, classified, decided, mockApi, reasoned, renderApp } from "./test/helpers";

const GATE_TITLE = "This one deserves more than an app.";
const settleWrites = () => new Promise((resolve) => setTimeout(resolve, 50));

function expectNoPickOnScreen() {
  expect(screen.queryByTestId("pick")).toBeNull();
  expect(screen.queryByTestId("confidence")).toBeNull();
  expect(screen.queryByRole("button", { name: "Going with it" })).toBeNull();
  expect(document.body.textContent).not.toMatch(/\d+%/);
}

describe("gate screen", () => {
  it("shows no pick, no probabilities and no ranked options for a gated decision", async () => {
    mockApi({
      "/api/classify": () => classified("gated"),
      // Even if a pick somehow came back, it must never be shown.
      "/api/decide": () => decided([["quit my job", 0.9], ["stay", 0.1]]),
    });
    const user = renderApp();
    await ask(user, ["quit my job", "stay"]);

    expect(await screen.findByText(GATE_TITLE)).toBeTruthy();
    expect(screen.getAllByTestId("gate-question")).toHaveLength(3);
    expectNoPickOnScreen();
    expect(screen.queryByText("quit my job")).toBeNull();
    expect(screen.queryByText("stay")).toBeNull();
  });

  it("shows the gate when the Worker refuses the pick with 422, whatever classify said", async () => {
    mockApi({
      "/api/classify": () => classified("small"),
      "/api/decide": () => ({ status: 422, body: { error: "gated" } }),
    });
    const user = renderApp();
    await ask(user, ["a", "b"]);
    expect(await screen.findByText(GATE_TITLE)).toBeTruthy();
    expectNoPickOnScreen();
  });

  it("shows the gate when a reason is refused with 422", async () => {
    mockApi({
      "/api/classify": () => classified("small"),
      "/api/decide": () => decided([["a", 0.8], ["b", 0.2]]),
      "/api/explain": () => ({ status: 422, body: { error: "gated" } }),
    });
    const user = renderApp();
    await ask(user, ["a", "b"]);
    await user.click(await screen.findByRole("button", { name: "Why?" }));
    expect(await screen.findByText(GATE_TITLE)).toBeTruthy();
    expectNoPickOnScreen();
  });

  it("saves a gated decision to history without any pick", async () => {
    mockApi({
      "/api/classify": () => classified("gated"),
      "/api/decide": () => ({ status: 422, body: { error: "gated" } }),
    });
    const user = renderApp();
    await ask(user, ["quit my job", "stay"]);
    await screen.findByText(GATE_TITLE);
    await waitFor(async () => expect(await listDecisions()).toHaveLength(1));
    const [saved] = await listDecisions();
    expect(saved).toMatchObject({ tier: "gated", crisis: false });
    expect(saved!.pick).toBeUndefined();
    expect(saved!.probabilities).toBeUndefined();
    expect(saved!.finalChoice).toBeUndefined();
  });
});

describe("failed or low-confidence classification", () => {
  it("never shows a pick when classification fails, even though decide succeeded", async () => {
    mockApi({
      "/api/classify": () => ({ status: 503, body: { error: "classification_failed" } }),
      "/api/decide": () => decided([["a", 0.9], ["b", 0.1]]),
    });
    const user = renderApp();
    await ask(user, ["a", "b"]);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
    expectNoPickOnScreen();
    await settleWrites();
    expect(await listDecisions()).toHaveLength(0);
  });

  it("holds the pick back until classification has passed", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    mockApi({
      "/api/classify": async () => {
        await gate;
        return classified("small");
      },
      "/api/decide": () => decided([["a", 0.9], ["b", 0.1]]),
    });
    const user = renderApp();
    await ask(user, ["a", "b"]);
    await settleWrites();
    expect(screen.getByRole("status").textContent).toContain("Deciding");
    expectNoPickOnScreen();
    release();
    expect((await screen.findByTestId("pick")).textContent).toBe("a");
  });

  it("retries from the error screen", async () => {
    let attempts = 0;
    mockApi({
      "/api/classify": () =>
        ++attempts === 1 ? { status: 503, body: { error: "classification_failed" } } : classified("small"),
      "/api/decide": () => decided([["a", 0.9], ["b", 0.1]]),
    });
    const user = renderApp();
    await ask(user, ["a", "b"]);
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect((await screen.findByTestId("pick")).textContent).toBe("a");
  });
});

describe("crisis", () => {
  it("shows a supportive message with no pick and no gate questions", async () => {
    mockApi({
      "/api/classify": () => classified("gated", true),
      "/api/decide": () => ({ status: 422, body: { error: "crisis" } }),
    });
    const user = renderApp();
    await ask(user, ["keep going", "end it all"]);

    const message = await screen.findByTestId("crisis");
    expect(message.textContent).toMatch(/emergency number/);
    expect(message.textContent).toMatch(/crisis line/);
    expect(screen.queryByText(GATE_TITLE)).toBeNull();
    expect(screen.queryAllByTestId("gate-question")).toHaveLength(0);
    expectNoPickOnScreen();
  });

  it("is absent from IndexedDB after the flow completes", async () => {
    mockApi({
      "/api/classify": () => classified("gated", true),
      "/api/decide": () => ({ status: 422, body: { error: "crisis" } }),
    });
    const user = renderApp();
    await ask(user, ["keep going", "end it all"], "I can't do this");
    await screen.findByTestId("crisis");
    await user.click(screen.getByRole("button", { name: "Start over" }));
    await settleWrites();
    expect(await listDecisions()).toHaveLength(0);
    // Starting over does not bring the text back either.
    expect((screen.getByLabelText("Option 1") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Context (optional)") as HTMLInputElement).value).toBe("");
  });

  it("is not saved when the crisis only surfaces at the pick or the reason", async () => {
    mockApi({
      "/api/classify": () => classified("small"),
      "/api/decide": () => decided([["a", 0.8], ["b", 0.2]]),
      "/api/explain": () => ({ status: 422, body: { error: "crisis" } }),
    });
    const user = renderApp();
    await ask(user, ["a", "b"]);
    await user.click(await screen.findByRole("button", { name: "Why?" }));
    await screen.findByTestId("crisis");
    expectNoPickOnScreen();
    await settleWrites();
    expect(await listDecisions()).toHaveLength(0);
  });

  it("an ordinary decision is unaffected", async () => {
    mockApi({
      "/api/classify": () => classified("small"),
      "/api/decide": () => decided([["a", 0.8], ["b", 0.2]]),
      "/api/explain": () => reasoned("A edged it."),
    });
    const user = renderApp();
    await ask(user, ["a", "b"]);
    expect((await screen.findByTestId("pick")).textContent).toBe("a");
  });
});
