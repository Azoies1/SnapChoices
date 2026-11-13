# Decisions

Each default taken and each place the build departs from the brief, with the reason.

## Defaults taken from the brief

- Installable web app, not native iOS.
- Cloudflare Workers backend, no accounts, history on the device.
- Dark theme, English only.
- Product name "Snap".
- Decision model order: Clef-flash first, OpenAI second (both arrive in milestone 5).
- No voice input.

## Defaults the brief left open

| Area | Choice | Reason |
| --- | --- | --- |
| Package manager | npm workspaces | pnpm is not installed on the build machine; npm needs nothing extra. |
| Tests for the Worker | Vitest in Node, calling the Hono app with `app.request()` | No Workers runtime needed for milestones 0 to 4. Revisit at M5 when the AI binding and rate limiter appear. |
| Option length | 80 characters per option, 200 for the context line | The brief sets no limit; the Worker needs one. |
| Duplicate check | Case-insensitive, after trimming and collapsing spaces | "Pizza" and "pizza " are the same option to a person. |
| Crisis threshold | P(yes) at or above 0.35 counts as a crisis | The brief asks for a yes/no question but no threshold. Set below 0.5 so an unsure model fails toward the support message. |
| Close-call boundary | A gap of exactly 10 points is not a close call | The brief says "under 10". |
| Keyword backstops | Regular expressions in `packages/shared/src/rules.ts`, broader than the brief's seven examples | A false match costs one gate screen; a miss costs a pick on a life decision. |
| Shared package | Consumed as TypeScript source, no build step | Vite, Wrangler and Vitest all compile it directly. |
| Helpline link | The crisis screen links to findahelpline.com | The brief asks for "a local crisis line" and the app has no location. **Thomas: please confirm this is the directory you want before launch.** |
| When history is written | On a reaction (accepted, switched, neither) and when the gate screen is shown | A pick the user never reacted to tells personalisation nothing. Gated decisions are saved with no pick, since the History screen lists a tier for every decision and the brief only excludes crisis. |
| Regret timing | 20 hours counted from `resolvedAt`; the most recently resolved eligible decision is asked about | The brief says "more than 20 hours old" without naming the timestamp. |
| Delete all | Two taps: the button turns into "Tap again to delete everything" | It cannot be undone. |
| Reason for medium and big | Fetched as soon as the pick is shown and filled in when it arrives; "Why?" stays as a retry if it fails | The pick is not held up by the slower text call. |

## Departures from the brief

| Brief | Build | Reason |
| --- | --- | --- |
| Only `/api/decide` is said to re-run classification | `/api/explain` re-runs it too, in every mode. Reason and question modes return 422 for gated or crisis; gate mode returns 422 for crisis and 400 for anything not gated | A reason is an endorsement of a pick, so it is gated like the pick. Costs one extra decision-model call per explain. A signed classification token from `/api/classify` would remove the repeat calls; left for M5 once real latency is known. |
| Classification sees "the same state" as the pick | The model classifies on options and context only; the keyword backstops also read the clarifying answer | Stops a clarifying answer from talking the model down a tier ("the gate cannot be overridden by rephrasing inside the same decision"). |
| A crisis is detected by a yes/no question in the classification call | If the keyword backstop already matches, the model is not called at all | The answer is already known, and the text is not sent anywhere. |
| Classify and decide "may run in parallel" | The client always fires both. For medium and big decisions the speculative pick is discarded and decide runs again with the clarifying answer | The tier is not known until classify returns. Costs one wasted decision-model call per medium or big decision. |
| Regret card text is "Yesterday you chose..." | "Yesterday" under 48 hours, "A while back" after that | A five-day-old decision is not yesterday. |
| Crisis decisions are "not saved to history" | Also: the form is cleared, and a record already written is deleted if the crisis only surfaces later (for example when the Worker refuses a reason) | Same intent, covering the late case. |
| Gate output "must not favour any option" | Enforced by a check: a gate question that names some options but not all is rejected, then the fixed questions are used | A prompt instruction alone cannot be tested. |
| Eval set of "at least 60: 15 per tier, including 15 gated and 5 crisis" | 65 examples: 15 per tier plus 5 crisis | The two counts do not fit in 60. |
| Eval script fails the build on one gated or crisis miss | True for real providers. On the mock it reports misses without failing | The mock classifies by keyword only, so its misses measure the backstop alone (currently 11 of 20 caught). The remaining 9 are the model's job and are the M5 gate. |
| Keyboard opens on the first field | `autoFocus` on the first field | iOS Safari only opens the keyboard after a user gesture; no web app can force it. |
| First-run notice, PWA manifest, rate limit, AI Gateway | Not built yet | They belong to milestones 5 and 6. |
