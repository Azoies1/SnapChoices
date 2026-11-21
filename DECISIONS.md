# Decisions

Each default taken and each place the build departs from the brief, with the reason.

## Defaults taken from the brief

- Installable web app, not native iOS.
- Cloudflare Workers backend, no accounts, history on the device.
- Dark theme, English only.
- Product name "Snap".
- Decision models: Clef-flash first; Jev replaced OpenAI as the second (see "Decision providers").
- No voice input.

## Defaults the brief left open

| Area | Choice | Reason |
| --- | --- | --- |
| Package manager | Bun workspaces | One tool for install, scripts and the `evals` runner; `bun.lock` is the lockfile. |
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
| Nudges after a pick | Up to 3 free-text follow-ups of 200 characters each re-run `/api/decide` with the same options. The keyword backstops read them; the tier model never sees them; a refusal still wins. Each saved nudge keeps the pick and ranking it pushed against | Lets a user steer a pick without restarting, and records what changed their mind for later personalisation. Same rule as the clarifier, so a nudge cannot talk a decision down a tier. |

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
| Eval script fails the build on one gated or crisis miss | True for real providers. On the mock it reports misses without failing | The mock classifies by keyword only, so its misses measure the backstop alone (11 of 20 caught). The rest are the model's job. Set `EVAL_URL` to run the set through a live Worker instead of in-process. |
| Keyboard opens on the first field | `autoFocus` on the first field | iOS Safari only opens the keyboard after a user gesture; no web app can force it. |
| First-run notice, PWA manifest, rate limit, AI Gateway | Not built yet | They belong to milestones 5 and 6. |

## Decision providers: Clef and Jev (added after M4)

| Brief | Build | Reason |
| --- | --- | --- |
| Adapters for Clef and OpenAI | Adapters for **Clef** and **Jev**; no OpenAI adapter | Thomas's call: run fully on Cloudflare Clef, with Jev as the switch. OpenAI's Decisions API can be added the same way (see below). |
| One adapter per provider | One shared System One codec, plus a transport per host | Clef and Jev take and return the same body (`state` plus typed `questions` in, typed `answers` out), so the only differences are where the request goes and how it authenticates. |
| Request shapes read from provider docs | Read from Cloudflare's published clef-flash input and output JSON schemas and TypeSafe's quickstart | Done. Jev's decode test uses a real response captured in OpenRouter's tutorial. **The Clef test response was written from the output schema** because the docs show no example; replace it with a real recording at first use. |
| Clef price "not found" | $0.038 per million input tokens, output free, 24,576-token context | From Cloudflare's model page. |
| Question ids | Same ids as before: `crisis`, `tier`, `pick` | They satisfy Clef's id pattern (letters, digits, `_ . -`). |
| Choice options | The user's own text is the option key, with no description | That is what both APIs return probabilities for, and the tier question carries its descriptions in `instructions`. Duplicate options were already rejected case-insensitively. |
| Yes/no answers | A `noul` question returns P(yes); the adapter reports `{ yes: p, no: 1 - p }` | Matches the provider interface in the brief. |
| Missing or malformed answers | A question the provider skips is left out; a present but invalid answer throws | Callers already treat both as a failed classification, so neither can produce a pick. Out-of-range or non-numeric probabilities are never repaired. |
| Timeouts | 8 seconds per provider call, then a generic timeout error | Not in the brief. A hung provider must not hold a decision open; the client shows a retry. |
| Key hygiene | A bearer key is only sent over https (or to localhost in tests); errors carry a code and a generic message, never request or response text | Privacy rule: the Worker must not log option text, context or model output. |
| Misconfiguration | A missing key, binding or bad setting returns 500 `misconfigured` and logs only the setting's name | Distinguishes an operator mistake from a provider outage. |

**Choosing a provider**

- `DECISION_PROVIDER=mock | clef | jev | gemini`. The registry is `decisionProviders` in `apps/api/src/providers/index.ts`.
- Clef inside a Worker uses the Workers AI binding (the `cloudflare` wrangler environment: `bun run --filter @snap/api dev:clef`). Outside a Worker, such as the eval script, it uses Cloudflare's REST API with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. `CLEF_MODEL` picks `clef-flash` (default) or `clef`.
- Jev needs `JEV_API_KEY`. It defaults to TypeSafe's endpoint and model `jev-latest`; set `JEV_BASE_URL` and `JEV_MODEL` to go through a gateway such as OpenRouter.
- The default model id `jev-latest` and the TypeSafe endpoint come from TypeSafe's quickstart. For classification that gates life decisions, **pin a dated version** (for example `jev-1.14`) once chosen, so a model update cannot change behaviour silently.

**Adding another decision model**

1. If `letsdecide` supports it (Jev, Clef, Gemini, OpenAI, any System One server): write a factory that calls `letsDecideProvider({ name, model: "<provider>/<model>", byProvider: { <provider>: { apiKey } } })`, as `gemini.ts` does.
2. If it is a known body at another URL (a gateway): describe it as a letsdecide dialect, as `jev.ts` does for `JEV_BASE_URL`.
3. If its host is not plain HTTP (like the Workers AI binding): pass a `fetch` that delivers the request letsdecide built, as `clef.ts` does.
4. List the factory in `decisionProviders`, add its variables to `env.ts`, and run `bun run eval`.

Verified live: Clef-flash through the Workers AI binding (18 Nov 2026). All 20 gated and crisis eval examples received no pick, and tier accuracy on the other 45 was 41/45. Not yet verified live: Jev, the Clef REST transport, and the Clef response shape beyond what the eval exercised (the stored test response is still schema-derived). The first call after `wrangler login` took longer than the 8-second timeout and failed; later calls took 0.3 to 0.6 seconds. `PROVIDER_TIMEOUT_MS` and `DEBUG_PROVIDER_ERRORS` exist for diagnosing that kind of failure and are off by default.

## Decision providers: on letsdecide (21 Nov 2026)

The hand-written System One codec and its three transports (`providers/systemOne/`) are replaced by the published [`letsdecide`](https://www.npmjs.com/package/letsdecide) 0.3.0 library. It builds each provider's request and checks each reply; Snap keeps its own `DecisionProvider` interface, timeout, error codes and fail-closed rules on top (`providers/letsdecide.ts`).

| Area | Choice | Reason |
| --- | --- | --- |
| Option ids | Options that are already valid ids (`[a-z0-9_]{1,64}`, such as the tier names) are sent as-is. Otherwise every option of that question is sent as `o0`, `o1`, ... with the user's text as its description, and the answer is mapped back to the text | letsdecide refuses free-text ids. This changes what the model sees for picks (before: the text was the key, with no description). Gemini was re-run on the full eval afterwards; **re-run Clef before relying on it** |
| Skipped answers | Now a `malformed` error, not a dropped answer | letsdecide treats a missing answer as a bad response. Callers already failed closed on both, so no pick can result either way |
| Clef inside a Worker | letsdecide builds the REST request; a `fetch` shim sends its body through the AI binding and wraps the reply in Cloudflare's envelope | One codec for both paths. The shim's account id and key are placeholders the binding never sees |
| `JEV_BASE_URL` | Still the full endpoint URL; split into a letsdecide dialect (`extends: "jev"`, origin plus path) | Keeps existing settings working; letsdecide's own `baseUrl` is origin-only |
| WASM in the Worker | `src/index.ts` imports the `.wasm` by relative path and hands it to the providers; Node (tests, eval) reads the bytes (`providers/wasmNode.ts`) | The package's `exports` map leaves the `.wasm` out and its default loader cannot fetch a file in workerd or Node |
| `fetch` | Always wrapped: `(input, init) => globalThis.fetch(input, init)` | letsdecide 0.3.0 calls the stored `fetch` as a method, which workerd rejects as "Illegal invocation". Found with `wrangler dev`; fixed upstream on the LetsDecide branch, not yet released |

Verified: the eval on Gemini Decision 1 through letsdecide, in-process (20/20 gated and crisis with no pick, tier 40/45), and a free-text pick (positional ids mapped back). Under `wrangler dev`, the Worker loads the WASM and reaches Google; the live call there could not be completed without a real key in `.dev.vars`. Not yet re-verified: Clef (binding and REST) after the move.
