import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { listDecisions } from "./db";
import { ask, classified, decided, mockApi, reasoned, renderApp, type Handlers } from "./test/helpers";

const SLEEP = "Sleep on it before you commit.";

const explain: Handlers["/api/explain"] = (body) => {
  if (body.mode === "question") {
    return { body: { mode: "question", question: "What matters most?", answers: ["Price", "Sound", "Comfort"] } };
  }
  if (body.mode === "gate") {
    return { body: { mode: "gate", questions: ["Model question one?", "Model question two?", "Model question three?"] } };
  }
  return reasoned("You said Sound, and Sony fits that best.");
};

describe("medium decision", () => {
  it("asks one question, then shows the pick with a one-line reason", async () => {
    const calls = mockApi({
      "/api/classify": () => classified("medium"),
      "/api/decide": (body) =>
        body.clarifier ? decided([["Sony", 0.7], ["Bose", 0.3]], "medium") : decided([["Bose", 0.6], ["Sony", 0.4]], "medium"),
      "/api/explain": explain,
    });
    const user = renderApp();
    await ask(user, ["Sony", "Bose"], "headphones");

    expect((await screen.findByTestId("clarifier")).textContent).toBe("What matters most?");
    expect(screen.queryByTestId("pick")).toBeNull();
    for (const answer of ["Price", "Sound", "Comfort"]) {
      expect(screen.getByRole("button", { name: answer })).toBeTruthy();
    }

    await user.click(screen.getByRole("button", { name: "Sound" }));
    // The pick comes from the call that carried the answer, not the speculative one.
    expect((await screen.findByTestId("pick")).textContent).toBe("Sony");
    expect(await screen.findByText("You said Sound, and Sony fits that best.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Why?" })).toBeNull();
    expect(screen.queryByText(SLEEP)).toBeNull();

    // classify, explain(question), decide with the answer, explain(reason)
    const withAnswer = calls.filter((c) => c.path === "/api/decide" && c.body.clarifier);
    expect(withAnswer).toHaveLength(1);
    expect(withAnswer[0]!.body.clarifier).toEqual({ question: "What matters most?", chosen: "Sound" });
    const order = calls.filter((c) => c.path === "/api/explain").map((c) => c.body.mode);
    expect(order).toEqual(["question", "reason"]);
    expect(calls.filter((c) => c.path === "/api/explain").at(-1)!.body.clarifier).toEqual({
      question: "What matters most?",
      chosen: "Sound",
    });

    await user.click(screen.getByRole("button", { name: "Going with it" }));
    await waitFor(async () =>
      expect((await listDecisions())[0]).toMatchObject({
        tier: "medium",
        clarifier: { question: "What matters most?", answers: ["Price", "Sound", "Comfort"], chosen: "Sound" },
        pick: "Sony",
        reason: "You said Sound, and Sony fits that best.",
        reaction: "accepted",
      }),
    );
  });

  it("keeps the pick and offers Why? again if the reason cannot be fetched", async () => {
    mockApi({
      "/api/classify": () => classified("medium"),
      "/api/decide": () => decided([["Sony", 0.7], ["Bose", 0.3]], "medium"),
      "/api/explain": (body) => (body.mode === "question" ? explain(body) : { status: 500, body: { error: "internal" } }),
    });
    const user = renderApp();
    await ask(user, ["Sony", "Bose"]);
    await user.click(await screen.findByRole("button", { name: "Price" }));
    expect((await screen.findByTestId("pick")).textContent).toBe("Sony");
    expect(await screen.findByText(/Couldn.t fetch a reason/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Why?" })).toBeTruthy();
  });

  it("goes to the gate if the Worker refuses the question", async () => {
    mockApi({
      "/api/classify": () => classified("medium"),
      "/api/decide": () => ({ status: 422, body: { error: "gated" } }),
      "/api/explain": (body) => (body.mode === "gate" ? explain(body) : { status: 422, body: { error: "gated" } }),
    });
    const user = renderApp();
    await ask(user, ["a", "b"]);
    expect(await screen.findByText("This one deserves more than an app.")).toBeTruthy();
    expect(screen.queryByTestId("pick")).toBeNull();
  });
});

describe("big decision", () => {
  it("is handled as medium, plus a line telling the user to sleep on it", async () => {
    mockApi({
      "/api/classify": () => classified("big"),
      "/api/decide": () => decided([["MacBook Air", 0.65], ["ThinkPad", 0.35]], "big"),
      "/api/explain": explain,
    });
    const user = renderApp();
    await ask(user, ["MacBook Air", "ThinkPad"]);
    await user.click(await screen.findByRole("button", { name: "Comfort" }));
    expect((await screen.findByTestId("pick")).textContent).toBe("MacBook Air");
    expect(screen.getByText(SLEEP)).toBeTruthy();
  });

  it("small decisions get no question and no sleep-on-it line", async () => {
    const calls = mockApi({
      "/api/classify": () => classified("small"),
      "/api/decide": () => decided([["tea", 0.7], ["coffee", 0.3]]),
      "/api/explain": explain,
    });
    const user = renderApp();
    await ask(user, ["tea", "coffee"]);
    await screen.findByTestId("pick");
    expect(screen.queryByText(SLEEP)).toBeNull();
    expect(calls.some((c) => c.path === "/api/explain")).toBe(false);
  });
});

describe("gate questions", () => {
  it("are generated for the user by the text model", async () => {
    const calls = mockApi({
      "/api/classify": () => classified("gated"),
      "/api/decide": () => ({ status: 422, body: { error: "gated" } }),
      "/api/explain": explain,
    });
    const user = renderApp();
    await ask(user, ["quit my job", "stay"]);
    expect(await screen.findByText("Model question one?")).toBeTruthy();
    expect(screen.getAllByTestId("gate-question")).toHaveLength(3);
    expect(calls.filter((c) => c.path === "/api/explain").map((c) => c.body.mode)).toEqual(["gate"]);
  });

  it("are replaced by a crisis message if the Worker reports a crisis at that point", async () => {
    mockApi({
      "/api/classify": () => classified("gated"),
      "/api/decide": () => ({ status: 422, body: { error: "gated" } }),
      "/api/explain": () => ({ status: 422, body: { error: "crisis" } }),
    });
    const user = renderApp();
    await ask(user, ["a", "b"]);
    expect(await screen.findByTestId("crisis")).toBeTruthy();
    expect(screen.queryAllByTestId("gate-question")).toHaveLength(0);
    // The gated record written a moment earlier is removed again.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await listDecisions()).toHaveLength(0);
  });
});
