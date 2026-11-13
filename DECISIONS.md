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
