# Dashboard starter

A minimal authenticated dashboard built on [Cache Components](https://nextjs.org/docs/app/getting-started/caching): the shell prerenders, and per-user sections verify the session and stream in parallel.

## How to use

```bash
npx create-next-app@latest --example https://github.com/vercel/next.js/tree/canary/starters/dashboard my-dashboard
```

Then run the development server:

```bash
npm run dev
```

Log in with any username; the session is a cookie-only stand-in for real authentication.

## What's inside

- `features/auth/auth-queries.ts` — the data access layer. `verifySession()` guards every per-user read and redirects unauthenticated requests to `/login`.
- `features/dashboard/dashboard-queries.ts` — per-user reads (never cached) next to shared reference data (cached with `cacheLife` and `cacheTag`), showing where the line is.
- `app/page.tsx` — a static page shell where each section streams in parallel behind its own `<Suspense>` boundary with a matched skeleton.
- `features/auth/auth-actions.ts` — login and logout as Server Actions writing the session cookie.

`AGENTS.md` describes this architecture for AI coding agents, so features added by an agent follow the same conventions. See the [AI agents guide](https://nextjs.org/docs/app/guides/ai-agents).
