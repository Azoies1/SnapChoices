import { useEffect, useState } from "react";
import type { Decision } from "@snap/shared";
import { deleteAllDecisions, listDecisions } from "../db";
import { Button, Screen } from "../ui";

const REGRET_LABEL: Record<NonNullable<Decision["regret"]>, string> = {
  yes: "Regretted it",
  no: "No regret",
  skipped: "Regret check skipped",
};

function outcome(decision: Decision): string {
  if (decision.finalChoice) return decision.finalChoice;
  if (decision.tier === "gated") return "No pick";
  if (decision.reaction === "neither") return "Neither";
  return "Unresolved";
}

function when(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function History({ onBack }: { onBack: () => void }) {
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let live = true;
    listDecisions()
      .then((all) => live && setDecisions(all))
      .catch(() => live && setDecisions([]));
    return () => {
      live = false;
    };
  }, []);

  async function deleteAll() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await deleteAllDecisions().catch(() => undefined);
    setDecisions([]);
    setConfirming(false);
  }

  return (
    <Screen
      header={
        <header className="flex items-center justify-between pb-4">
          <h1 className="text-xl font-black tracking-tight">History</h1>
          <button type="button" onClick={onBack} className="min-h-11 px-1 text-base font-semibold text-snap">
            Back
          </button>
        </header>
      }
      footer={
        decisions && decisions.length > 0 ? (
          <Button
            variant={confirming ? "secondary" : "ghost"}
            className={confirming ? "border-warn text-warn" : ""}
            onClick={() => void deleteAll()}
          >
            {confirming ? "Tap again to delete everything" : "Delete all"}
          </Button>
        ) : null
      }
    >
      {decisions === null ? null : decisions.length === 0 ? (
        <p className="pt-10 text-center text-lg text-mute">Nothing decided yet.</p>
      ) : (
        <ul className="flex flex-col gap-3 pb-2">
          {decisions.map((decision) => (
            <li key={decision.id} data-testid="history-item" className="rounded-2xl border border-line bg-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <p data-testid="history-choice" className="min-w-0 break-words text-xl font-bold leading-tight">
                  {outcome(decision)}
                </p>
                <span
                  data-testid="history-tier"
                  className="shrink-0 rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-mute"
                >
                  {decision.tier}
                </span>
              </div>
              <p className="pt-1 break-words text-sm text-mute">{decision.options.join(" · ")}</p>
              {decision.clarifier ? (
                <p className="pt-1 break-words text-sm text-mute">
                  {decision.clarifier.question} {decision.clarifier.chosen}
                </p>
              ) : null}
              {decision.nudges?.length ? (
                <p data-testid="history-nudges" className="pt-1 break-words text-sm text-mute">
                  {decision.nudges.map((n) => `“${n.text}”`).join(" · ")}
                </p>
              ) : null}
              <p className="pt-2 text-sm text-mute">
                {when(decision.createdAt)}
                {decision.reaction === "switched" ? " · Switched from the pick" : ""}
                {decision.regret ? (
                  <span data-testid="history-regret" className={decision.regret === "yes" ? "text-warn" : ""}>
                    {" · "}
                    {REGRET_LABEL[decision.regret]}
                  </span>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
