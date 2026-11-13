import type { Decision } from "@snap/shared";

const TWO_DAYS_MS = 48 * 60 * 60 * 1000;

const CHOICE = "min-h-11 flex-1 rounded-xl border border-line bg-ink px-3 text-base font-semibold active:bg-line";

/** One card per app open, for a resolved decision more than 20 hours old. */
export function RegretCard({
  decision,
  now,
  onAnswer,
}: {
  decision: Decision;
  now: number;
  onAnswer: (regret: NonNullable<Decision["regret"]>) => void;
}) {
  const recent = now - (decision.resolvedAt ?? now) < TWO_DAYS_MS;
  return (
    <section data-testid="regret-card" className="mb-5 rounded-2xl border border-line bg-panel p-4">
      <p className="text-lg leading-snug">
        {recent ? "Yesterday" : "A while back"} you chose <strong className="font-bold">{decision.finalChoice}</strong>.
        Any regret?
      </p>
      <div className="flex gap-2 pt-3">
        <button type="button" className={CHOICE} onClick={() => onAnswer("yes")}>
          Yes
        </button>
        <button type="button" className={CHOICE} onClick={() => onAnswer("no")}>
          No
        </button>
        <button type="button" className={`${CHOICE} text-mute`} onClick={() => onAnswer("skipped")}>
          Skip
        </button>
      </div>
    </section>
  );
}
