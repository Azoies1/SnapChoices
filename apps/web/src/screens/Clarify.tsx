import { Button, Screen } from "../ui";

/** The one multiple-choice question a medium or big decision gets before its pick. */
export function Clarify({
  question,
  answers,
  onAnswer,
}: {
  question: string;
  answers: string[];
  onAnswer: (answer: string) => void;
}) {
  return (
    <Screen
      footer={answers.map((answer) => (
        <Button key={answer} onClick={() => onAnswer(answer)}>
          {answer}
        </Button>
      ))}
    >
      <div className="flex flex-1 flex-col justify-center gap-4">
        <p className="text-base font-semibold uppercase tracking-widest text-mute">One question first</p>
        <h1 data-testid="clarifier" className="text-4xl font-black leading-tight tracking-tight">
          {question}
        </h1>
      </div>
    </Screen>
  );
}
