import { Button, Screen } from "../ui";

/** No pick and no gate questions. Nothing about this decision is saved. */
export function Crisis({ onNew }: { onNew: () => void }) {
  return (
    <Screen
      footer={
        <Button variant="ghost" onClick={onNew}>
          Start over
        </Button>
      }
    >
      <div data-testid="crisis" className="flex flex-1 flex-col justify-center gap-5 py-6">
        <h1 className="text-4xl font-black leading-tight tracking-tight">This sounds heavy, and it matters.</h1>
        <p className="text-xl leading-snug">
          I won&rsquo;t pick here. You deserve a real person for this, not an app.
        </p>
        <p className="text-xl leading-snug">
          If you or someone else might be in danger, please call your local emergency number now.
        </p>
        <p className="text-xl leading-snug">
          Otherwise, a crisis line in your country will listen, any time, without judgement.{" "}
          <a
            className="font-semibold text-snap underline underline-offset-4"
            href="https://findahelpline.com"
            target="_blank"
            rel="noreferrer"
          >
            Find a helpline near you
          </a>
          .
        </p>
        <p className="text-lg text-mute">Nothing you typed here has been saved.</p>
      </div>
    </Screen>
  );
}
