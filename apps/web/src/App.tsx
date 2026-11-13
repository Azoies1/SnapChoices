import { useRef, useState } from "react";
import { validateOptions, type DecideResponse, type Decision, type DecisionInput } from "@snap/shared";
import { api, ApiError } from "./api";
import { saveDecision, updateDecision } from "./db";
import { Ask, EMPTY_DRAFT, type Draft } from "./screens/Ask";
import { Pick, SwitchPrompt, type ReasonState } from "./screens/Pick";
import { Resolve } from "./screens/Resolve";
import { Button, Centered, Screen } from "./ui";

type View =
  | { name: "ask" }
  | { name: "loading" }
  | { name: "pick" }
  | { name: "switch" }
  | { name: "resolve" }
  | { name: "error"; message: string };

function inputOf(decision: Decision): DecisionInput {
  return {
    options: decision.options,
    ...(decision.context ? { context: decision.context } : {}),
    ...(decision.clarifier
      ? { clarifier: { question: decision.clarifier.question, chosen: decision.clarifier.chosen } }
      : {}),
  };
}

function withPick(record: Decision, result: DecideResponse, decideMs: number): Decision {
  return {
    ...record,
    probabilities: Object.fromEntries(result.ranked.map((r) => [r.option, r.probability])),
    pick: result.pick,
    runnerUp: result.runnerUp,
    closeCall: result.closeCall,
    provider: result.provider,
    timings: { ...record.timings, decideMs: Math.round(decideMs) },
  };
}

export default function App() {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [view, setView] = useState<View>({ name: "ask" });
  const [decision, setDecision] = useState<Decision | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [reasonState, setReasonState] = useState<ReasonState>("idle");
  /** Bumped whenever a flow starts or is abandoned, so late responses are dropped. */
  const run = useRef(0);
  const saved = useRef(new Set<string>());

  function persist(record: Decision) {
    saved.current.add(record.id);
    void saveDecision(record).catch(() => undefined);
  }

  function patch(id: string, change: Partial<Decision>) {
    setDecision((d) =>
      d && d.id === id ? { ...d, ...change, timings: { ...d.timings, ...change.timings } } : d,
    );
    if (saved.current.has(id)) void updateDecision(id, change).catch(() => undefined);
  }

  function fail(error: unknown) {
    if (error instanceof ApiError && error.status === 400) {
      setFormError(error.message);
      setView({ name: "ask" });
      return;
    }
    setView({ name: "error", message: "Couldn’t make a pick just now. Nothing was chosen." });
  }

  async function start() {
    const checked = validateOptions(draft.options);
    if (!checked.ok) {
      setFormError(checked.message);
      return;
    }
    setFormError(null);
    const context = draft.context.trim();
    const record: Decision = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      options: checked.options,
      ...(context ? { context } : {}),
      tier: "small",
      crisis: false,
      timings: {},
      provider: "unknown",
    };
    const token = ++run.current;
    setDecision(record);
    setReasonState("idle");
    setView({ name: "loading" });

    try {
      const began = performance.now();
      const result = await api.decide(inputOf(record));
      if (token !== run.current) return;
      setDecision(withPick(record, result, performance.now() - began));
      setView({ name: "pick" });
    } catch (error) {
      if (token === run.current) fail(error);
    }
  }

  async function why() {
    if (!decision?.pick) return;
    const { id, pick } = decision;
    setReasonState("loading");
    const began = performance.now();
    try {
      const result = await api.explain({ ...inputOf(decision), mode: "reason", pick });
      if (result.mode !== "reason") throw new Error("unexpected mode");
      patch(id, { reason: result.reason, timings: { explainMs: Math.round(performance.now() - began) } });
      setReasonState("idle");
    } catch {
      setReasonState("error");
    }
  }

  function finish(reaction: NonNullable<Decision["reaction"]>, finalChoice?: string) {
    if (!decision) return;
    const done: Decision = {
      ...decision,
      reaction,
      ...(finalChoice ? { finalChoice } : {}),
      resolvedAt: Date.now(),
    };
    setDecision(done);
    persist(done);
    // "Neither" goes back to Ask with the options kept; the draft is untouched.
    setView(reaction === "neither" ? { name: "ask" } : { name: "resolve" });
  }

  function reset() {
    run.current++;
    setDraft(EMPTY_DRAFT);
    setDecision(null);
    setFormError(null);
    setView({ name: "ask" });
  }

  switch (view.name) {
    case "ask":
      return (
        <Ask
          draft={draft}
          error={formError}
          onChange={(next) => {
            setDraft(next);
            setFormError(null);
          }}
          onDecide={() => void start()}
        />
      );
    case "loading":
      return (
        <Screen>
          <Centered>
            <p role="status" className="animate-pulse text-3xl font-black tracking-tight text-mute">
              Deciding&hellip;
            </p>
          </Centered>
        </Screen>
      );
    case "pick":
      return decision ? (
        <Pick
          decision={decision}
          reasonState={reasonState}
          onAccept={() => finish("accepted", decision.pick)}
          onWhy={() => void why()}
          onReject={() => setView({ name: "switch" })}
        />
      ) : null;
    case "switch":
      return decision ? (
        <SwitchPrompt
          runnerUp={decision.runnerUp ?? ""}
          onYes={() => finish("switched", decision.runnerUp)}
          onNeither={() => finish("neither")}
        />
      ) : null;
    case "resolve":
      return <Resolve choice={decision?.finalChoice ?? ""} onNew={reset} />;
    case "error":
      return (
        <Screen
          footer={
            <>
              <Button variant="primary" onClick={() => void start()}>
                Try again
              </Button>
              <Button
                onClick={() => {
                  run.current++;
                  setView({ name: "ask" });
                }}
              >
                Back
              </Button>
            </>
          }
        >
          <Centered>
            <p role="alert" className="max-w-xs text-2xl font-bold">
              {view.message}
            </p>
          </Centered>
        </Screen>
      );
  }
}
