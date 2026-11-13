import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { listDecisions } from "./db";
import { ask, classified, decided, mockApi, reasoned, renderApp } from "./test/helpers";

const CLOSE_CALL = /These are basically equal\. More thinking won.t help\./;

describe("small decision loop", () => {
  it("takes two taps after typing: Decide, then Going with it", async () => {
    const calls = mockApi({
      "/api/classify": () => classified("small"),
      "/api/decide": () => decided([["sushi", 0.7], ["pizza", 0.3]]),
    });
    const user = renderApp();

    await ask(user, ["pizza", "sushi"], "dinner tonight");
    expect((await screen.findByTestId("pick")).textContent).toBe("sushi");
    expect(screen.getByTestId("confidence").textContent).toBe("70%");
    expect(screen.queryByText(CLOSE_CALL)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Going with it" }));
    expect(screen.getByTestId("final-choice").textContent).toBe("sushi");
    expect(screen.getByRole("button", { name: "New decision" })).toBeTruthy();

    const decide = calls.find((c) => c.path === "/api/decide")!;
    expect(decide.body).toMatchObject({ options: ["pizza", "sushi"], context: "dinner tonight" });

    await waitFor(async () => expect(await listDecisions()).toHaveLength(1));
    const [saved] = await listDecisions();
    expect(saved).toMatchObject({
      options: ["pizza", "sushi"],
      pick: "sushi",
      runnerUp: "pizza",
      reaction: "accepted",
      finalChoice: "sushi",
      closeCall: false,
      crisis: false,
      provider: "mock",
    });
    expect(saved!.resolvedAt).toBeTypeOf("number");
    expect(saved!.timings.decideMs).toBeTypeOf("number");
  });

  it("Why? fetches a one-line reason only on tap, then offers the other two buttons", async () => {
    const calls = mockApi({
      "/api/classify": () => classified("small"),
      "/api/decide": () => decided([["gym", 0.8], ["rest", 0.2]]),
      "/api/explain": () => reasoned("Gym edged it."),
    });
    const user = renderApp();
    await ask(user, ["gym", "rest"]);
    await screen.findByTestId("pick");
    expect(calls.some((c) => c.path === "/api/explain")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Why?" }));
    expect(await screen.findByText("Gym edged it.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Why?" })).toBeNull();
    expect(screen.getByRole("button", { name: "Going with it" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Not feeling it" })).toBeTruthy();
    expect(calls.find((c) => c.path === "/api/explain")!.body).toMatchObject({ mode: "reason", pick: "gym" });

    await user.click(screen.getByRole("button", { name: "Going with it" }));
    await waitFor(async () => expect((await listDecisions())[0]?.reason).toBe("Gym edged it."));
  });

  it("Not feeling it offers the runner-up, and Yes saves it as switched", async () => {
    mockApi({
      "/api/classify": () => classified("small"),
      "/api/decide": () => decided([["red", 0.5], ["blue", 0.3], ["green", 0.2]]),
    });
    const user = renderApp();
    await ask(user, ["red", "blue", "green"]);
    await screen.findByTestId("pick");

    await user.click(screen.getByRole("button", { name: "Not feeling it" }));
    expect(screen.getByText("Then you wanted")).toBeTruthy();
    expect(screen.getByTestId("runner-up").textContent).toBe("blue");
    expect(screen.getByText("Go with that?")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Yes" }));
    expect(screen.getByTestId("final-choice").textContent).toBe("blue");
    await waitFor(async () =>
      expect((await listDecisions())[0]).toMatchObject({ reaction: "switched", finalChoice: "blue", pick: "red" }),
    );
  });

  it("Neither returns to Ask with the options kept", async () => {
    mockApi({
      "/api/classify": () => classified("small"),
      "/api/decide": () => decided([["tea", 0.6], ["coffee", 0.4]]),
    });
    const user = renderApp();
    await ask(user, ["tea", "coffee"]);
    await screen.findByTestId("pick");
    await user.click(screen.getByRole("button", { name: "Not feeling it" }));
    await user.click(screen.getByRole("button", { name: "Neither" }));

    expect((screen.getByLabelText("Option 1") as HTMLInputElement).value).toBe("tea");
    expect((screen.getByLabelText("Option 2") as HTMLInputElement).value).toBe("coffee");
    await waitFor(async () => expect((await listDecisions())[0]).toMatchObject({ reaction: "neither" }));
    expect((await listDecisions())[0]!.finalChoice).toBeUndefined();
  });

  it("New decision clears the form", async () => {
    mockApi({
      "/api/classify": () => classified("small"),
      "/api/decide": () => decided([["a", 0.9], ["b", 0.1]]),
    });
    const user = renderApp();
    await ask(user, ["a", "b"]);
    await user.click(await screen.findByRole("button", { name: "Going with it" }));
    await user.click(screen.getByRole("button", { name: "New decision" }));
    expect((screen.getByLabelText("Option 1") as HTMLInputElement).value).toBe("");
  });
});

describe("close-call message", () => {
  it("appears when the top two differ by under 10 points, with the pick still shown", async () => {
    mockApi({
      "/api/classify": () => classified("small"),
      "/api/decide": () => decided([["tacos", 0.53], ["ramen", 0.47]]),
    });
    const user = renderApp();
    await ask(user, ["tacos", "ramen"]);
    expect((await screen.findByTestId("pick")).textContent).toBe("tacos");
    expect(screen.getByText(CLOSE_CALL)).toBeTruthy();
  });

  it("does not appear at a gap of exactly 10 points", async () => {
    mockApi({
      "/api/classify": () => classified("small"),
      "/api/decide": () => decided([["tacos", 0.55], ["ramen", 0.45]]),
    });
    const user = renderApp();
    await ask(user, ["tacos", "ramen"]);
    await screen.findByTestId("pick");
    expect(screen.queryByText(CLOSE_CALL)).toBeNull();
  });
});

describe("option entry", () => {
  it("cannot decide with fewer than 2 options", async () => {
    const calls = mockApi({});
    const user = renderApp();
    const decide = screen.getByRole("button", { name: "Decide" }) as HTMLButtonElement;
    expect(decide.disabled).toBe(true);
    await user.type(screen.getByLabelText("Option 1"), "only one");
    expect(decide.disabled).toBe(true);
    await user.type(screen.getByLabelText("Option 1"), "{Enter}");
    expect(calls).toHaveLength(0);
  });

  it("cannot add more than 4 options", async () => {
    mockApi({});
    const user = renderApp();
    await user.click(screen.getByRole("button", { name: "+ Add option" }));
    await user.click(screen.getByRole("button", { name: "+ Add option" }));
    expect(screen.getByLabelText("Option 4")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "+ Add option" })).toBeNull();
  });

  it("rejects duplicates with a clear message and makes no request", async () => {
    const calls = mockApi({});
    const user = renderApp();
    await ask(user, ["Pizza", "pizza"]);
    expect(screen.getByRole("alert").textContent).toContain("in there twice");
    expect(calls).toHaveLength(0);
  });

  it("rejects an empty option among filled ones", async () => {
    const calls = mockApi({});
    const user = renderApp();
    await ask(user, ["a", "b", ""]);
    expect(screen.getByRole("alert").textContent).toBe("Fill in or remove the empty option.");
    expect(calls).toHaveLength(0);
  });

  it("shows a retry and no pick when the request fails", async () => {
    mockApi({
      "/api/classify": () => classified("small"),
      "/api/decide": () => ({ status: 502, body: { error: "decision_failed" } }),
    });
    const user = renderApp();
    await ask(user, ["a", "b"]);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByTestId("pick")).toBeNull();
    expect(await listDecisions()).toHaveLength(0);
  });
});
