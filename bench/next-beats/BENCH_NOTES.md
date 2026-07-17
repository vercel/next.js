# next-beats (bench fixture)

A real-world Next.js App Router app (music player) vendored into `bench/` as a
benchmark target with realistic component trees: Tailwind, nested layouts,
Suspense/PPR boundaries, client islands, `use cache`, and per-user data access.
Unlike the synthetic fixtures here, it exercises the render pipeline the way a
production app does.

## What was changed from the original demo

The upstream demo runs on Neon Postgres with Vercel Analytics. For a hermetic,
deterministic, offline benchmark it was adapted as follows:

- **Postgres → in-memory store.** `lib/db.ts` holds a `globalThis`-backed store
  seeded deterministically from `lib/seed-data.ts` (44 tracks, 3 playlists, an
  `e2e` user). The query and action modules read and write plain arrays. No
  database, driver, or `postinstall` step, so the app builds and serves fully
  offline like the other `bench/` fixtures. The store lives on `globalThis` so
  the RSC, Server Action, and Route Handler bundles share one instance.
- **`next` → workspace.** `package.json` points `next` at
  `link:../../packages/next`, so it builds against the React that this repo
  vendors. React itself comes from the workspace-wide pnpm override.
- **Auth gate removed.** The original `proxy.ts` redirected un-authed requests to
  `/login`; it was deleted and `getCurrentUser()` now defaults to the seeded
  `e2e` user, so every route renders real per-user work under load instead of a
  redirect.
- **Telemetry removed.** `@vercel/analytics` / `@vercel/speed-insights` dropped
  to avoid network noise. Secrets (`.env.local`) were never copied.

## Setup

No setup step. The seed data is a TypeScript module (`lib/seed-data.ts`) loaded
into memory on first import, so `pnpm install` is all that is needed. To change
the fixture data, edit `lib/seed-data.ts`.

## Building / serving

```bash
cd bench/next-beats
node ../../packages/next/dist/bin/next build
node ../../packages/next/dist/bin/next start -p 3123
```

Representative routes are listed in `routes.json`, for pointing a load tool or
profiler at the pages worth measuring.

## Determinism

Rendered output is byte-stable across GET requests: all data comes from the
deterministically seeded in-memory store (timestamps are derived from a fixed
epoch, not wall-clock), and no Server Component renders wall-clock or relative
time (the only `Date.now()` is client-side audio scheduling). This keeps A/B
payload comparisons free of data noise.

The one mutation path is `POST /api/play`, which increments `playCount` and
writes `lastPlayedAt`. It is intentionally excluded from `routes.json`; keep it
out of stress runs (or restart the server afterward to re-seed) so payloads
don't drift mid-run.

## How to benchmark it

This is a standalone fixture: build and serve it, then measure with whatever
tool fits, the same way the other real-app fixtures under `bench/` are driven
(directly or through `@vercel/devlow-bench`). Build, start, and profile the
routes in `routes.json` in the Chrome Performance panel, or point a load tool at
them.

It is not wired into `bench:render-pipeline`. That runner is specific to the
synthetic `bench/basic-app` fixture and rewrites a fixture's `next.config` to an
empty one for the run, which would strip the `cacheComponents` / PPR config that
is the whole point of benchmarking this app.

> **Good to know:** If the compiled `next` JS is ahead of the installed native
> SWC binary, `next build` can fail with a `MemoryEvictionMode` error. This is
> not specific to this app (`bench/basic-app` fails identically). Rebuild SWC to
> match, or set `experimental.turbopackMemoryEviction: false` as a local
> workaround.
