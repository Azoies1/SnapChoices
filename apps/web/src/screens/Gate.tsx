import { Button, Screen } from "../ui";

/**
 * Shown instead of a pick for life-altering decisions. Nothing here ranks,
 * scores or highlights an option, and the options are not listed at all.
 */
export function Gate({ questions, onNew }: { questions: string[] | null; onNew: () => void }) {
  return (
    <Screen footer={<Button onClick={onNew}>New decision</Button>}>
      <div className="flex flex-1 flex-col justify-center gap-6 py-6">
        <h1 className="text-4xl font-black leading-tight tracking-tight">This one deserves more than an app.</h1>
        <p className="text-lg text-mute">No pick here. Take these to someone you trust:</p>
        {questions ? (
          <ol className="flex flex-col gap-3">
            {questions.map((question, index) => (
              <li
                key={index}
                data-testid="gate-question"
                className="rounded-2xl border border-line bg-panel p-4 text-lg leading-snug"
              >
                {question}
              </li>
            ))}
          </ol>
        ) : (
          <p role="status" className="animate-pulse text-lg text-mute">
            Writing three questions&hellip;
          </p>
        )}
      </div>
    </Screen>
  );
}
