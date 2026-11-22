# Snap

Mobile-first web app that picks for an indecisive person. Enter 2–4 options, get one pick with a confidence figure, react to it, nudge it.

**Status:** M0–M4 done on the mock provider. Clef-flash and Gemini Decision 1 verified live (both pass the gate eval). Jev never called live. Provider calls go through the [`letsdecide`](https://www.npmjs.com/package/letsdecide) library. Next: M5 (live eval, Haiku text, rate limit), M6 (PWA shell, deploy).

## Quick start

```bash
bun install
bun run dev
```

- Web: http://localhost:5173, proxies `/api` to the Worker on `:8787`.

| Command | Does |
| --- | --- |
| `bun run test` | Vitest, all workspaces |
| `bun run typecheck` | `tsc --noEmit`, all workspaces |
| `bun run lint` | ESLint |
| `bun run build` | Typecheck + Vite build of the web app |
| `bun run eval` | Run the labelled set through classification |

## How it works

- Worker re-classifies every request; client-sent tiers are never trusted.
- Tiers: **small** (instant pick) · **medium** (one question, pick + reason) · **big** (as medium + "Sleep on it") · **gated** (no pick, three questions) · **crisis** (support screen, never saved).
- Classify and pick run in parallel; pick is held back until classification passes.
- Up to 3 free-text nudges re-run the pick; they can only raise the tier, never lower it.
- History lives on the device (IndexedDB). No accounts.

## API

| Endpoint | Purpose | Refusals |
| --- | --- | --- |
| `GET /api/health` | `{ ok, provider }` | none |
| `POST /api/classify` | Tier + crisis flag | 503 |
| `POST /api/decide` | Tier, ranking, pick | 422 `gated` / `crisis`, 502, 503 |
| `POST /api/explain` | `mode`: `reason`, `question` or `gate` | 422, 400, 503 |

## Decision providers

Set `DECISION_PROVIDER` to `mock` (default), `clef`, `jev` or `gemini`. Only the Worker holds a key.

| Provider | Run | Needs |
| --- | --- | --- |
| `mock` | `bun run dev` | nothing |
| `clef` | `bun run --filter @snap/api dev:clef` | Cloudflare login (Workers AI binding, runs remotely) |
| `jev` | `DECISION_PROVIDER=jev` + `JEV_API_KEY` in `apps/api/.dev.vars` | TypeSafe or OpenRouter key |
| `gemini` | `DECISION_PROVIDER=gemini` + `GEMINI_API_KEY` in `apps/api/.dev.vars` | Google AI Studio key |

| Variable | Use |
| --- | --- |
| `CLEF_MODEL` | `clef-flash` (default) or `clef` |
| `JEV_BASE_URL`, `JEV_MODEL` | Point Jev at a gateway (full endpoint URL); pin a dated model |
| `GEMINI_MODEL` | Default `gemini-decision-1` |
| `PROVIDER_TIMEOUT_MS` | Provider timeout, default 8000 |
| `DEBUG_PROVIDER_ERRORS=1` | Log underlying errors. Local only: may quote input |

Adding a provider: see the last section of [DECISIONS.md](DECISIONS.md).

## Eval

```bash
bun run eval                                           # mock, in-process
EVAL_URL=http://127.0.0.1:8787 bun run eval            # through a running Worker (e.g. dev:clef)
DECISION_PROVIDER=clef CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... bun run eval   # Clef REST
DECISION_PROVIDER=gemini GEMINI_API_KEY=... bun run eval                               # Gemini
```

- 65 labelled examples: 15 per tier + 5 crisis.
- One gated/crisis miss fails a real-provider run; mock only reports.

| Measure | Mock | Clef-flash | Gemini Decision 1 | Jev |
| --- | --- | --- | --- | --- |
| Gated + crisis given no pick | 11/20 (keyword backstop only) | **20/20** | **20/20** (5/5 crisis shown support) | not run |
| Tier accuracy, non-gated | 32/45 (71%) | **41/45 (91%)** | **40/45 (89%)**, 1 over-gated | not run |
| `/api/decide` latency p90 (50 runs) | n/a | **0.31 s** (p50 0.24 s) | not measured (whole eval: 22 s for 65 calls) | not run |

Gemini: eval script, in-process, through `letsdecide` 0.3.0, 21 Nov 2026. Clef: run through local `wrangler dev` with remote Workers AI, 18 Nov 2026, before the move to `letsdecide`; re-run it. Excludes browser hop and first post-login call (slow). Mock column shows the backstop alone, not quality.

## Try the mock

| Type | Get |
| --- | --- |
| `pizza` / `sushi` | Small: instant pick |
| `the Sony headphones` / `the Bose headphones` | Medium: one question, pick + reason |
| `MacBook Air` / `ThinkPad laptop` | Big: as medium + "Sleep on it before you commit." |
| `quit my job` / `stay` | Gated: no pick, three questions |

## Layout

| Path | Contents |
| --- | --- |
| `apps/web` | React 19, Vite, Tailwind. Screens in `src/screens`, IndexedDB in `db.ts` |
| `apps/api` | Cloudflare Worker (Hono). Providers in `src/providers`, shared codec in `providers/systemOne` |
| `packages/shared` | Types, tier/gate/close-call rules, keyword backstops (TS source, no build) |
| `evals` | Labelled set (`set.ts`) and runner (`run.ts`) |

See [DECISIONS.md](DECISIONS.md) for defaults and departures from the brief.
