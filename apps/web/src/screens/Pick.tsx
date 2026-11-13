import type { Decision } from "@snap/shared";
import { Button, Centered, Screen } from "../ui";

export type ReasonState = "idle" | "loading" | "error";

/**
 * Big enough to read at arm's length, stepping down as the option gets longer.
 * The longest word matters as much as the total: at 375 px a 10-letter word in
 * text-6xl does not fit on one line and would be split mid-word.
 */
export function pickSize(text: string): string {
  const longestWord = Math.max(0, ...text.split(/\s+/).map((w) => w.length));
  if (text.length <= 10 && longestWord <= 6) return "text-7xl";
  if (text.length <= 20 && longestWord <= 8) return "text-6xl";
  if (text.length <= 40 && longestWord <= 11) return "text-5xl";
  if (longestWord <= 14) return "text-4xl";
  return "text-3xl";
}

export function Pick({
  decision,
  reasonState,
  onAccept,
  onWhy,
  onReject,
}: {
  decision: Decision;
  reasonState: ReasonState;
  onAccept: () => void;
  onWhy: () => void;
  onReject: () => void;
}) {
  const pick = decision.pick ?? "";
  const confidence = Math.round((decision.probabilities?.[pick] ?? 0) * 100);

  return (
    <Screen
      footer={
        <>
          <Button variant="primary" onClick={onAccept}>
            Going with it
          </Button>
          <div className="flex gap-3">
            {decision.reason ? null : (
              <Button onClick={onWhy} disabled={reasonState === "loading"}>
                Why?
              </Button>
            )}
            <Button onClick={onReject}>Not feeling it</Button>
          </div>
        </>
      }
    >
      <Centered>
        <p className="text-base font-semibold uppercase tracking-widest text-mute">Go with</p>
        <h1
          data-testid="pick"
          className={`snap-in max-w-full text-balance break-words font-black leading-[0.95] tracking-tight ${pickSize(pick)}`}
        >
          {pick}
        </h1>
        <p className="text-2xl font-bold text-snap">
          <span data-testid="confidence">{confidence}%</span>
          <span className="pl-2 text-base font-semibold text-mute">confident</span>
        </p>
        {decision.closeCall ? (
          <p className="max-w-xs text-lg text-fg">These are basically equal. More thinking won&rsquo;t help.</p>
        ) : null}
        {decision.reason ? <p className="max-w-xs text-lg text-mute">{decision.reason}</p> : null}
        {reasonState === "loading" ? <p className="text-base text-mute">Thinking of how to put it&hellip;</p> : null}
        {reasonState === "error" ? (
          <p className="text-base text-warn">Couldn&rsquo;t fetch a reason. The pick stands.</p>
        ) : null}
        {decision.tier === "big" ? (
          <p className="max-w-xs text-lg font-semibold text-warn">Sleep on it before you commit.</p>
        ) : null}
      </Centered>
    </Screen>
  );
}

export function SwitchPrompt({
  runnerUp,
  onYes,
  onNeither,
}: {
  runnerUp: string;
  onYes: () => void;
  onNeither: () => void;
}) {
  return (
    <Screen
      footer={
        <>
          <Button variant="primary" onClick={onYes}>
            Yes
          </Button>
          <Button onClick={onNeither}>Neither</Button>
        </>
      }
    >
      <Centered>
        <p className="text-base font-semibold uppercase tracking-widest text-mute">Then you wanted</p>
        <h1
          data-testid="runner-up"
          className={`snap-in max-w-full text-balance break-words font-black leading-[0.95] tracking-tight ${pickSize(runnerUp)}`}
        >
          {runnerUp}
        </h1>
        <p className="text-2xl font-bold">Go with that?</p>
      </Centered>
    </Screen>
  );
}
