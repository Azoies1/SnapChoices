import { useEffect, useRef, useState } from "react";
import {
  GATE_FALLBACK_QUESTIONS,
  validateOptions,
  type ClassifyResponse,
  type DecideResponse,
  type Decision,
  type DecisionInput,
} from "@snap/shared";
import { api, ApiError } from "./api";
import { deleteDecision, findRegretCandidate, saveDecision, updateDecision } from "./db";
import { History } from "./screens/History";
import { RegretCard } from "./screens/RegretCard";
import { Ask, EMPTY_DRAFT, type Draft } from "./screens/Ask";
import { Clarify } from "./screens/Clarify";
import { Crisis } from "./screens/Crisis";
import { Gate } from "./screens/Gate";
import { Pick, SwitchPrompt, type ReasonState } from "./screens/Pick";
import { Resolve } from "./screens/Resolve";
import { Button, Centered, Screen } from "./ui";

type View =
  | { name: "ask" }
  | { name: "loading" }
  | { name: "clarify"; question: string; answers: string[] }
  | { name: "pick" }
  | { name: "switch" }
  | { name: "resolve" }
  | { name: "gate" }
  | { name: "crisis" }
  | { name: "history" }
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
    ...(decision.nudges?.length ? { nudges: decision.nudges.map((n) => n.text) } : {}),
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
  const [nudgeState, setNudgeState] = useState<ReasonState>("idle");
  const [gateQuestions, setGateQuestions] = useState<string[] | null>(null);
  /** Bumped whenever a flow starts or is abandoned, so late responses are dropped. */
  const run = useRef(0);
  const saved = useRef(new Set<string>());
  const [regret, setRegret] = useState<{ decision: Decision; now: number } | null>(null);

  // Regret check: looked up once per app open, so at most one card is ever shown.
  useEffect(() => {
    let live = true;
    const now = Date.now();
    findRegretCandidate(now)
      .then((due) => {
        if (live && due) setRegret({ decision: due, now });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  function answerRegret(answer: NonNullable<Decision["regret"]>) {
    if (!regret) return;
    void updateDecision(regret.decision.id, { regret: answer }).catch(() => undefined);
    setRegret(null);
  }

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
  function showCrisis(id?: string) {
    run.current++;
    // If the crisis only surfaced after this decision was written, remove it again.
    if (id && saved.current.delete(id)) void deleteDecision(id).catch(() => undefined);
    setDecision(null);
    setDraft(EMPTY_DRAFT);
    setView({ name: "crisis" });
  }

  function showGate(record: Decision) {
    const gated: Decision = { ...record, tier: "gated" };
    const token = ++run.current;
    setDecision(gated);
    persist(gated);
    setGateQuestions(null);
    setView({ name: "gate" });

    void settle(api.explain({ ...inputOf(gated), mode: "gate" })).then((asked) => {
      if (token !== run.current) return;
      if (asked.ok && asked.value.mode === "gate") {
        setGateQuestions(asked.value.questions);
      } else if (!asked.ok && asked.error instanceof ApiError && asked.error.code === "crisis") {
        showCrisis(gated.id);
      } else {
        // The gate screen never depends on the network for its questions.
        setGateQuestions(GATE_FALLBACK_QUESTIONS);
      }
    });
  }

  /** Handles any failed request. A 422 is the Worker refusing to pick. */
  function fail(error: unknown, record: Decision) {
    if (error instanceof ApiError && error.status === 422) {
      if (error.code === "crisis") showCrisis(record.id);
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
    setNudgeState("idle");
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

    if (classification.tier !== "small") {
      // Medium and big: one clarifying question first. The speculative pick is thrown away.
      const asked = await settle(api.explain({ ...input, mode: "question" }));
      if (token !== run.current) return;
      if (asked.ok && asked.value.mode === "question") {
        setDecision(record);
        setView({ name: "clarify", question: asked.value.question, answers: asked.value.answers });
        return;
      }
      if (!asked.ok && asked.error instanceof ApiError && asked.error.status === 422) {
        return fail(asked.error, record);
      }
      // The question could not be fetched: fall through to the pick made without it.
    }

    const decided = await deciding;
    if (token !== run.current) return;
    if (!decided.ok) return fail(decided.error, record);
    const picked = withPick(record, decided.value, decided.ms);
    setDecision(picked);
    setView({ name: "pick" });
    if (picked.tier !== "small") void why(picked);
  }

  /** Medium flow, second half: decide with the answer appended, then fetch the reason. */
  async function answer(question: string, answers: string[], chosen: string) {
    if (!decision) return;
    const record: Decision = { ...decision, clarifier: { question, answers, chosen } };
    const token = ++run.current;
    setDecision(record);
    setView({ name: "loading" });

    const decided = await settle(api.decide(inputOf(record)));
    if (token !== run.current) return;
    if (!decided.ok) return fail(decided.error, record);
    const picked = withPick(record, decided.value, decided.ms);
    setDecision(picked);
    setView({ name: "pick" });
    void why(picked);
  }

  /** After a pick: the user adds something, and the same options are ranked again with it. */
  async function nudge(text: string) {
    const before = decision;
    if (!before?.pick || !before.probabilities) return;
    const nudges = [...(before.nudges ?? []), { text, probabilities: before.probabilities, pick: before.pick }];
    const token = ++run.current;
    setNudgeState("loading");

    const decided = await settle(api.decide(inputOf({ ...before, nudges })));
    if (token !== run.current) return;
    if (!decided.ok) {
      setNudgeState("idle");
      // A refusal still wins: a nudge can raise the tier to gated or reveal a crisis.
      if (decided.error instanceof ApiError && decided.error.status === 422) return fail(decided.error, before);
      setNudgeState("error");
      return;
    }
    const picked: Decision = { ...withPick(before, decided.value, decided.ms), nudges };
    delete picked.reason; // The old reason argued for the old pick.
    setDecision(picked);
    setReasonState("idle");
    setNudgeState("idle");
    if (picked.tier !== "small") void why(picked);
  }

  async function why(current: Decision | null = decision) {
    if (!current?.pick) return;
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
          top={
            regret ? <RegretCard decision={regret.decision} now={regret.now} onAnswer={answerRegret} /> : null
          }
          headerAction={
            <button
              type="button"
              onClick={() => setView({ name: "history" })}
              className="min-h-11 px-1 text-base font-semibold text-mute active:text-fg"
            >
              History
            </button>
          }
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
    case "clarify":
      return (
        <Clarify
          question={view.question}
          answers={view.answers}
          onAnswer={(chosen) => void answer(view.question, view.answers, chosen)}
        />
      );
    case "pick":
      return decision ? (
        <Pick
          decision={decision}
          reasonState={reasonState}
          nudgeState={nudgeState}
          onNudge={(text) => void nudge(text)}
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
    case "history":
      return <History onBack={() => setView({ name: "ask" })} />;
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
