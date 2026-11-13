# Snap

A mobile-first web app that makes a pick for an indecisive person. Enter 2 to 4 options, get one pick with a confidence figure, react to it.

Status: milestones 0 to 4 of the build brief, running on the mock provider. No API keys are needed yet.

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

## Layout

- `apps/web` React app (Vite, Tailwind)
- `apps/api` Cloudflare Worker (Hono)
- `packages/shared` types and the tier, gate and close-call rules used by both
- `evals` labelled test set and the script that runs it

See [DECISIONS.md](DECISIONS.md) for defaults taken and departures from the brief.
