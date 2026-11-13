import { Button, Centered, Screen } from "../ui";
import { pickSize } from "./Pick";

export function Resolve({ choice, onNew }: { choice: string; onNew: () => void }) {
  return (
    <Screen
      footer={
        <Button variant="primary" onClick={onNew}>
          New decision
        </Button>
      }
    >
      <Centered>
        <p className="text-base font-semibold uppercase tracking-widest text-mute">Decided</p>
        <h1
          data-testid="final-choice"
          className={`max-w-full text-balance break-words font-black leading-[0.95] tracking-tight ${pickSize(choice)}`}
        >
          {choice}
        </h1>
        <p className="text-lg text-mute">Done. Go do it.</p>
      </Centered>
    </Screen>
  );
}
