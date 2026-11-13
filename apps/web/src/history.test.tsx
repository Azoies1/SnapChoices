import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Decision } from "@snap/shared";
import { findRegretCandidate, listDecisions, saveDecision, updateDecision } from "./db";
import { ask, classified, decided, mockApi, renderApp } from "./test/helpers";

const HOUR = 60 * 60 * 1000;

function record(overrides: Partial<Decision>): Decision {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    options: ["a", "b"],
    tier: "small",
    crisis: false,
    timings: {},
    provider: "mock",
    ...overrides,
  };
}

function resolved(choice: string, hoursAgo: number, overrides: Partial<Decision> = {}): Decision {
  const at = Date.now() - hoursAgo * HOUR;
  return record({
    createdAt: at,
    resolvedAt: at,
    options: [choice, "something else"],
    pick: choice,
    finalChoice: choice,
    reaction: "accepted",
    ...overrides,
  });
}

describe("storage", () => {
  it("never writes a decision flagged as crisis", async () => {
    await saveDecision(record({ crisis: true }));
    expect(await listDecisions()).toHaveLength(0);
  });

  it("lists newest first and merges updates", async () => {
    const older = record({ createdAt: 1000, timings: { decideMs: 5 } });
    const newer = record({ createdAt: 2000 });
    await saveDecision(older);
    await saveDecision(newer);
    await updateDecision(older.id, { reason: "because", timings: { explainMs: 9 } });
    const all = await listDecisions();
    expect(all.map((d) => d.id)).toEqual([newer.id, older.id]);
    expect(all[1]).toMatchObject({ reason: "because", timings: { decideMs: 5, explainMs: 9 } });
  });

  it("finds a regret candidate only past 20 hours, resolved, and unanswered", async () => {
    const now = Date.now();
    await saveDecision(resolved("too recent", 19));
    await saveDecision(resolved("answered", 30, { regret: "no" }));
    await saveDecision(record({ createdAt: now - 30 * HOUR, tier: "gated" }));
    await saveDecision(record({ createdAt: now - 30 * HOUR, resolvedAt: now - 30 * HOUR, reaction: "neither" }));
    expect(await findRegretCandidate(now)).toBeNull();
    await saveDecision(resolved("due", 21));
    expect((await findRegretCandidate(now))?.finalChoice).toBe("due");
  });
});

describe("History screen", () => {
  it("lists past decisions newest first with the final choice, tier and regret answer", async () => {
    await saveDecision(resolved("sushi", 50, { regret: "no" }));
    await saveDecision(resolved("the Sony headphones", 5, { tier: "medium", reaction: "switched" }));
    await saveDecision(record({ createdAt: Date.now() - 1 * HOUR, tier: "gated", options: ["quit", "stay"] }));
    const user = renderApp();

    await user.click(screen.getByRole("button", { name: "History" }));
    await waitFor(() => expect(screen.getAllByTestId("history-item")).toHaveLength(3));
    expect(screen.getAllByTestId("history-choice").map((e) => e.textContent)).toEqual([
      "No pick",
      "the Sony headphones",
      "sushi",
    ]);
    expect(screen.getAllByTestId("history-tier").map((e) => e.textContent)).toEqual(["gated", "medium", "small"]);
    const regrets = screen.getAllByTestId("history-regret");
    expect(regrets).toHaveLength(1);
    expect(regrets[0]!.textContent).toContain("No regret");

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Option 1")).toBeTruthy();
  });

  it("shows a decision made in this session", async () => {
    mockApi({
      "/api/classify": () => classified("small"),
      "/api/decide": () => decided([["tea", 0.7], ["coffee", 0.3]]),
    });
    const user = renderApp();
    await ask(user, ["tea", "coffee"]);
    await user.click(await screen.findByRole("button", { name: "Going with it" }));
    await user.click(screen.getByRole("button", { name: "New decision" }));
    await user.click(screen.getByRole("button", { name: "History" }));
    expect((await screen.findByTestId("history-choice")).textContent).toBe("tea");
  });

  it("Delete all asks once more, then empties the device store", async () => {
    await saveDecision(resolved("sushi", 3));
    await saveDecision(resolved("pizza", 2));
    const user = renderApp();
    await user.click(screen.getByRole("button", { name: "History" }));
    await user.click(await screen.findByRole("button", { name: "Delete all" }));
    expect(await listDecisions()).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Tap again to delete everything" }));
    expect(await screen.findByText("Nothing decided yet.")).toBeTruthy();
    expect(await listDecisions()).toHaveLength(0);
  });
});

describe("regret check", () => {
  it("shows one card for a decision older than 20 hours and saves the answer", async () => {
    const due = resolved("sushi", 21);
    await saveDecision(due);
    const user = renderApp();

    const card = await screen.findByTestId("regret-card");
    expect(card.textContent).toBe("Yesterday you chose sushi. Any regret?YesNoSkip");
    await user.click(screen.getByRole("button", { name: "No" }));
    expect(screen.queryByTestId("regret-card")).toBeNull();
    await waitFor(async () => expect((await listDecisions())[0]?.regret).toBe("no"));
  });

  it.each([
    ["Yes", "yes"],
    ["Skip", "skipped"],
  ])("records %s as %s", async (button, value) => {
    await saveDecision(resolved("sushi", 25));
    const user = renderApp();
    await screen.findByTestId("regret-card");
    await user.click(screen.getByRole("button", { name: button }));
    await waitFor(async () => expect((await listDecisions())[0]?.regret).toBe(value));
  });

  it("shows at most one card per app open", async () => {
    await saveDecision(resolved("sushi", 30));
    await saveDecision(resolved("pizza", 40));
    const user = renderApp();
    await screen.findByTestId("regret-card");
    expect(screen.getAllByTestId("regret-card")).toHaveLength(1);
    // The most recently resolved one is asked about.
    expect(screen.getByTestId("regret-card").textContent).toContain("sushi");
    await user.click(screen.getByRole("button", { name: "Skip" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId("regret-card")).toBeNull();
    expect((await listDecisions()).filter((d) => !d.regret)).toHaveLength(1);
  });

  it("shows no card for a decision under 20 hours old", async () => {
    await saveDecision(resolved("sushi", 19));
    renderApp();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId("regret-card")).toBeNull();
  });
});
