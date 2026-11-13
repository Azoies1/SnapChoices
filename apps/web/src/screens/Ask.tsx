import type { FormEvent, ReactNode } from "react";
import { MAX_CONTEXT_LENGTH, MAX_OPTIONS, MAX_OPTION_LENGTH, MIN_OPTIONS } from "@snap/shared";
import { Button, Screen } from "../ui";

export type Draft = { options: string[]; context: string };

export const EMPTY_DRAFT: Draft = { options: ["", ""], context: "" };

const FIELD =
  "min-h-14 w-full rounded-2xl border border-line bg-panel px-4 text-lg text-fg placeholder:text-mute/70 focus:border-snap focus:outline-none";

export function Ask({
  draft,
  error,
  top,
  headerAction,
  onChange,
  onDecide,
}: {
  draft: Draft;
  error: string | null;
  top?: ReactNode;
  headerAction?: ReactNode;
  onChange: (draft: Draft) => void;
  onDecide: () => void;
}) {
  const filled = draft.options.filter((o) => o.trim()).length;
  const canAdd = draft.options.length < MAX_OPTIONS;

  const setOption = (index: number, value: string) =>
    onChange({ ...draft, options: draft.options.map((o, i) => (i === index ? value : o)) });
  const removeOption = (index: number) =>
    onChange({ ...draft, options: draft.options.filter((_, i) => i !== index) });
  const addOption = () => {
    if (canAdd) onChange({ ...draft, options: [...draft.options, ""] });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (filled >= MIN_OPTIONS) onDecide();
  };

  return (
    <form onSubmit={submit} className="h-full" noValidate>
      <Screen
        header={
          <header className="flex items-center justify-between pb-4">
            <span className="text-xl font-black tracking-tight">
              Snap<span className="text-snap">.</span>
            </span>
            {headerAction}
          </header>
        }
        footer={
          <>
            {error ? (
              <p role="alert" className="text-center text-base text-warn">
                {error}
              </p>
            ) : null}
            <Button type="submit" variant="primary" disabled={filled < MIN_OPTIONS}>
              Decide
            </Button>
          </>
        }
      >
        {top}
        <h1 className="pb-5 text-3xl font-black leading-tight tracking-tight">Can&rsquo;t decide? Give me the options.</h1>
        <div className="flex flex-col gap-3">
          {draft.options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                className={FIELD}
                value={option}
                onChange={(e) => setOption(index, e.target.value)}
                placeholder={`Option ${index + 1}`}
                aria-label={`Option ${index + 1}`}
                maxLength={MAX_OPTION_LENGTH}
                autoFocus={index === 0}
                autoComplete="off"
                enterKeyHint={index === draft.options.length - 1 ? "go" : "next"}
              />
              {draft.options.length > MIN_OPTIONS ? (
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  aria-label={`Remove option ${index + 1}`}
                  className="h-14 w-11 shrink-0 rounded-2xl text-2xl text-mute active:text-fg"
                >
                  &times;
                </button>
              ) : null}
            </div>
          ))}
          {canAdd ? (
            <button
              type="button"
              onClick={addOption}
              className="min-h-12 self-start rounded-2xl px-1 text-base font-semibold text-snap"
            >
              + Add option
            </button>
          ) : null}
          <input
            className={`${FIELD} mt-2 text-base`}
            value={draft.context}
            onChange={(e) => onChange({ ...draft, context: e.target.value })}
            placeholder="Optional: dinner tonight, on a budget"
            aria-label="Context (optional)"
            maxLength={MAX_CONTEXT_LENGTH}
            autoComplete="off"
            enterKeyHint="go"
          />
        </div>
      </Screen>
    </form>
  );
}
