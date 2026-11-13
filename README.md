# Snap

A mobile-first web app that makes a pick for an indecisive person. Enter 2 to 4 options, get one pick with a confidence figure, react to it.

**Status:** milestones 0 to 4 of the build brief are done and run on the mock provider. No API keys are needed yet. Milestone 5 (real providers) needs keys; milestone 6 is the PWA shell and deploy.

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

| Measure | Mock | Clef | OpenAI |
| --- | --- | --- | --- |
| Gated and crisis examples given no pick | 11/20 (keyword backstop alone) | M5 | M5 |
| Tier accuracy, non-gated examples | 32/45 (71%) | M5 | M5 |
| Small-decision latency, p90 over 50 runs | not measured | M6 | M6 |

The mock row is not a quality figure. It shows what the keyword backstop catches with no model behind it.

See [DECISIONS.md](DECISIONS.md) for defaults taken and departures from the brief.
