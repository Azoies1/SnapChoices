import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { listDecisions } from "./db";
import { ask, classified, decided, mockApi, renderApp } from "./test/helpers";

async function nudge(user: ReturnType<typeof renderApp>, text: string) {
  await user.type(screen.getByLabelText("Tell me more"), text);
  await user.click(screen.getByRole("button", { name: "Re-pick" }));
}

describe("nudges after a pick", () => {
  it("re-pick with the nudge, show what changed, and save the path", async () => {
    const calls = mockApi({
      "/api/classify": () => classified("small"),
      "/api/decide": (body) =>
        body.nudges ? decided([["pizza", 0.65], ["sushi", 0.35]]) : decided([["sushi", 0.62], ["pizza", 0.38]]),
    });
    const user = renderApp();
    await ask(user, ["pizza", "sushi"]);
    expect((await screen.findByTestId("pick")).textContent).toBe("sushi");

    await nudge(user, "I had sushi yesterday");
    await waitFor(() => expect(screen.getByTestId("pick").textContent).toBe("pizza"));
    expect(screen.getByTestId("confidence").textContent).toBe("65%");
    expect(screen.getByTestId("nudge-change").textContent).toBe("Was sushi at 62%");
    expect(calls.at(-1)!.body).toMatchObject({ options: ["pizza", "sushi"], nudges: ["I had sushi yesterday"] });

    await user.click(screen.getByRole("button", { name: "Going with it" }));
    await waitFor(async () => expect(await listDecisions()).toHaveLength(1));
    expect((await listDecisions())[0]).toMatchObject({
      pick: "pizza",
      finalChoice: "pizza",
      nudges: [{ text: "I had sushi yesterday", pick: "sushi", probabilities: { sushi: 0.62, pizza: 0.38 } }],
    });
  });

  it(`stop after 3`, async () => {
    mockApi({
      "/api/classify": () => classified("small"),
      "/api/decide": () => decided([["a", 0.6], ["b", 0.4]]),
    });
    const user = renderApp();
    await ask(user, ["a", "b"]);
    await screen.findByTestId("pick");
    for (const text of ["one", "two", "three"]) {
      await nudge(user, text);
      await waitFor(() => expect(screen.queryByText(/Re-thinking/)).toBeNull());
    }
    expect(screen.queryByLabelText("Tell me more")).toBeNull();
  });

  it("keep the pick when the re-pick fails", async () => {
    mockApi({
      "/api/classify": () => classified("small"),
      "/api/decide": (body) => (body.nudges ? { status: 502, body: { error: "decision_failed" } } : decided([["a", 0.7], ["b", 0.3]])),
    });
    const user = renderApp();
    await ask(user, ["a", "b"]);
    await screen.findByTestId("pick");
    await nudge(user, "hmm");
    expect(await screen.findByText(/Couldn.t re-pick just now/)).toBeTruthy();
    expect(screen.getByTestId("pick").textContent).toBe("a");
  });

  it("go to the gate screen when the Worker refuses the nudged decision", async () => {
    mockApi({
      "/api/classify": () => classified("small"),
      "/api/decide": (body) => (body.nudges ? { status: 422, body: { error: "gated" } } : decided([["a", 0.7], ["b", 0.3]])),
      "/api/explain": () => ({ body: { mode: "gate", questions: ["q1", "q2", "q3"] } }),
    });
    const user = renderApp();
    await ask(user, ["a", "b"]);
    await screen.findByTestId("pick");
    await nudge(user, "it decides if I quit my job");
    await waitFor(() => expect(screen.queryByTestId("pick")).toBeNull());
    expect(screen.queryByLabelText("Tell me more")).toBeNull();
  });
});
