import { useRef, useState } from "react";
import {
  GATE_FALLBACK_QUESTIONS,
  validateOptions,
  type ClassifyResponse,
  type DecideResponse,
  type Decision,
  type DecisionInput,
} from "@snap/shared";
import { api, ApiError } from "./api";
import { saveDecision, updateDecision } from "./db";
import { Ask, EMPTY_DRAFT, type Draft } from "./screens/Ask";
import { Crisis } from "./screens/Crisis";
import { Gate } from "./screens/Gate";
import { Pick, SwitchPrompt, type ReasonState } from "./screens/Pick";
import { Resolve } from "./screens/Resolve";
import { Button, Centered, Screen } from "./ui";

type View =
  | { name: "ask" }
  | { name: "loading" }
  | { name: "pick" }
  | { name: "switch" }
  | { name: "resolve" }
  | { name: "gate" }
  | { name: "crisis" }
  | { name: "error"; message: string };

type Settled<T> = { ok: true; value: T; ms: number } | { ok: false; error: unknown };

/** Times a request and never rejects, so a speculative call can be left unawaited. */
function settle<T>(request: Promise<T>): Promise<Settled<T>> {
  const began = performance.now();
  return request.then(
    (value) => ({ ok: true, value, ms: Math.round(performance.now() - began) }),
    (error: unknown) => ({ ok: false, error }),
  );
}

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
    timings: { ...record.timings, decideMs },
  };
}

export default function App() {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [view, setView] = useState<View>({ name: "ask" });
  const [decision, setDecision] = useState<Decision | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [reasonState, setReasonState] = useState<ReasonState>("idle");
  const [gateQuestions, setGateQuestions] = useState<string[] | null>(null);
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

  /** Crisis: no pick, no gate questions, and the decision is dropped rather than saved. */
  function showCrisis() {
    run.current++;
    setDecision(null);
    setDraft(EMPTY_DRAFT);
    setView({ name: "crisis" });
  }

  function showGate(record: Decision) {
    const gated: Decision = { ...record, tier: "gated" };
    setDecision(gated);
    persist(gated);
    setGateQuestions(GATE_FALLBACK_QUESTIONS);
    setView({ name: "gate" });
  }

  /** Handles any failed request. A 422 is the Worker refusing to pick. */
  function fail(error: unknown, record: Decision) {
    if (error instanceof ApiError && error.status === 422) {
      if (error.code === "crisis") showCrisis();
      else showGate(record);
      return;
    }
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
    let record: Decision = {
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
    setGateQuestions(null);
    setView({ name: "loading" });

    // Classify and decide run in parallel to hit the one-second target. The
    // pick is held back until classification passes, and the Worker enforces
    // the same rule on its side.
    const input = inputOf(record);
    const deciding = settle<DecideResponse>(api.decide(input));
    const classifying = await settle<ClassifyResponse>(api.classify(input));
    if (token !== run.current) return;
    if (!classifying.ok) return fail(classifying.error, record);

    const classification = classifying.value;
    if (classification.crisis) return showCrisis();
    record = { ...record, tier: classification.tier, timings: { classifyMs: classifying.ms } };
    if (classification.tier === "gated") return showGate(record);

    const decided = await deciding;
    if (token !== run.current) return;
    if (!decided.ok) return fail(decided.error, record);
    setDecision(withPick(record, decided.value, decided.ms));
    setView({ name: "pick" });
  }

  async function why() {
    if (!decision?.pick) return;
    const current = decision;
    const token = run.current;
    setReasonState("loading");
    const explained = await settle(api.explain({ ...inputOf(current), mode: "reason", pick: current.pick! }));
    if (token !== run.current) return;
    if (explained.ok && explained.value.mode === "reason") {
      patch(current.id, { reason: explained.value.reason, timings: { explainMs: explained.ms } });
      setReasonState("idle");
    } else if (!explained.ok && explained.error instanceof ApiError && explained.error.status === 422) {
      fail(explained.error, current);
    } else {
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
    case "gate":
      return <Gate questions={gateQuestions} onNew={reset} />;
    case "crisis":
      return <Crisis onNew={reset} />;
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
