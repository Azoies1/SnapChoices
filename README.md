# Snap

A mobile-first web app that makes a pick for an indecisive person. Enter 2 to 4 options, get one pick with a confidence figure, react to it.

**Status:** milestones 0 to 4 of the build brief are done and run on the mock provider. The Clef-flash has run live and passes the gate eval. The Jev adapter is built but has not called a live service. Milestone 5 is the live run and the eval; milestone 6 is the PWA shell and deploy.

## Run it

```bash
npm install
```

```bash
npm run dev
```

The web app is at http://localhost:5173 and proxies `/api` to the Worker on port 8787.

## Check it

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm run eval
```

## Choosing a decision model

Set `DECISION_PROVIDER` to `mock` (default), `clef` or `jev`. Only the Worker ever holds a key.

| Provider | How to run it | Needs |
| --- | --- | --- |
| `mock` | `npm run dev` | nothing |
| `clef` | `npm run dev:clef -w @snap/api` (Workers AI binding, runs remotely) | a Cloudflare login |
| `jev` | `DECISION_PROVIDER=jev` and `JEV_API_KEY` in `apps/api/.dev.vars` (see `.dev.vars.example`) | a TypeSafe or OpenRouter key |

To run the eval against a real model:

```bash
DECISION_PROVIDER=clef CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... npm run eval
```

The last section of [DECISIONS.md](DECISIONS.md) explains how to add another provider.

## What the mock provider does

`DECISION_PROVIDER=mock` (the default in `apps/api/wrangler.jsonc`) picks by a stable hash of the input and classifies by keyword, so the same options always give the same pick. To see each path:

| Type this | You get |
| --- | --- |
| `pizza` / `sushi` | Small: an instant pick |
| `the Sony headphones` / `the Bose headphones` | Medium: one question, then a pick with a reason |
| `MacBook Air` / `ThinkPad laptop` | Big: as medium, plus "Sleep on it before you commit." |
| `quit my job` / `stay` | Gated: no pick, three questions |

## Layout

- `apps/web` React app (Vite, Tailwind)
- `apps/api` Cloudflare Worker (Hono): `POST /api/classify`, `/api/decide`, `/api/explain`
- `packages/shared` types and the tier, gate and close-call rules used by both
- `evals` the labelled set (`set.ts`) and the script that runs it (`run.ts`)

## Numbers

| Measure | Mock | Clef-flash | Jev |
| --- | --- | --- | --- |
| Gated and crisis examples given no pick | 11/20 (keyword backstop alone) | **20/20** | not run |
| Tier accuracy, non-gated examples | 32/45 (71%) | **41/45 (91%)** | not run |
| Pick latency at the Worker, p90 over 50 runs | not measured | **0.31 s** (p50 0.24 s) | not run |

Clef figures: 65-example eval run through a local `wrangler dev` Worker with the remote Workers AI binding, 18 Nov 2026; latency is `POST /api/decide` (classify and pick in parallel) timed from the same machine, so it excludes the browser hop and the first call after a login, which was slow. The mock column is not a quality figure. It shows what the keyword backstop catches with no model behind it.

See [DECISIONS.md](DECISIONS.md) for defaults taken and departures from the brief.
