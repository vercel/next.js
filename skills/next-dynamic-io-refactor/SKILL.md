---
name: next-dynamic-io-refactor
description: >
  Statically refactor a Next.js App Router codebase so it behaves correctly
  under `cacheComponents: true` (Cache Components / "dynamic IO"). Use when a
  build fails with "couldn't be rendered statically" / "outside a Suspense
  boundary" / "uncached data" / empty `generateStaticParams`, when turning
  cacheComponents on for a messy app, or when asked to push dynamic IO down /
  maximize the static shell. This skill is STATIC: it works by structural
  analysis of the `app/` source tree (scan.mjs) — no running app, no browser,
  no `instant()` measurement rig. It inventories every `await` / `use()` /
  `cookies()` / `headers()` / `searchParams` / uncached `fetch` and every
  `loading.tsx` / `<Suspense fallback>`, classifies each, and applies four
  levers: move to a root param + `generateStaticParams`, pass the promise down
  and unwrap it in a Suspense-wrapped child, `'use cache'`, and granular
  fallback decomposition. `next build` on the latest canary is the oracle.
  Ships a headless self-eval (`eval/`) that proves a messy fixture app on
  next@canary.
---

# next-dynamic-io-refactor

Take a Next.js App Router app from "breaks / goes fully dynamic under
`cacheComponents: true`" to "builds with the largest possible static shell" —
by **reading the source, not running it**.

This is the static sibling of the runtime shell/nav optimizers. It does **not**
open a browser, set the instant cookie, or measure `instant()`. The whole loop
is: structurally inventory the route tree → classify each dynamic-IO site
against a fixed decision framework → refactor → let `next build` on canary
confirm. Cache Components is designed so that **dynamic-IO mistakes are build
errors** — that makes the compiler a precise, deterministic oracle, which is
why a static approach works here.

> Use this skill when the request is "make this app work under cacheComponents",
> "fix these PPR/dynamic-IO build errors", "get more of the page into the static
> shell", or "audit every `await`/fallback for dynamic IO". For _measuring_ an
> already-building app's runtime shell or click-to-paint, that's the runtime
> rig's job, not this one.

## Requires

- `cacheComponents: true` in `next.config.{ts,js,mjs}`. If it isn't set, this is
  the first edit — everything else is downstream of it. Refuse to "audit for
  dynamic IO" without it; there is no dynamic-IO model to check against.
- The **latest `next@canary`** as the build oracle. Cache Components is
  pre-stable; its build diagnostics change release-to-release, so pin the
  verification to canary (`npm view next@canary version` to see it). Match the
  app to canary before trusting any build verdict.

## The objective

**Maximize the static shell.** Every component that _can_ be prerendered should
land in the shell; only genuinely per-request, per-user data should stream
behind a `<Suspense>`. "It builds" is necessary but not sufficient — an app
where every page is one big `<Suspense fallback={null}>` also builds, and shows
a blank shell. The target is: **builds clean ∧ dynamic holes are minimal and
each is covered by a real, granular fallback.**

The build's route table is the static read on how well you did:

```
○  (Static)            prerendered, no dynamic holes        ← best
◐  (Partial Prerender) static shell + streamed holes        ← good
ƒ  (Dynamic)           rendered per request, no shell       ← a hole to close
```

Drive segments **up** that ranking. A page that is `ƒ` when its only dynamic
input is an enumerable param, or `◐` with a near-empty shell, is the work.

## The decision framework (the core)

This is the whole method. Apply it to **every** dynamic-IO site and **every**
fallback, mechanically, from the source.

### How to solve a dynamic-IO site — two structural moves

1. **Move to a root param + `generateStaticParams`.** If the dynamic value is
   (or can become) a route param whose set is enumerable, make it a param —
   ideally a _root_ param (a dynamic segment the root layout sits inside,
   readable anywhere via `next/root-params` without prop-drilling) — and
   enumerate it with `generateStaticParams`. Then `await params` resolves at
   build time and lands in the shell. (Under Cache Components every root param
   still needs ≥1 value from `generateStaticParams`.)

2. **Pass the promise down and unwrap it in a child.** Don't `await` at the top
   — that makes everything below it dynamic. Pass the **unresolved promise** as
   a prop into a small `<Suspense>`-wrapped child, and `await` it (async Server
   Component) or `use()` it there. The parent's static content lifts into the
   shell; only the child streams.

### For each `await` / `use()` — interrogate

- **Can it be pushed down?** Move the read into the _smallest_ component that
  actually needs the value, so everything above stays static.
- **Can we pass only the promise down?** Prefer handing the child the promise
  (`params`, `cookies()`, a fetch promise) over awaiting it first — awaiting
  first re-blocks the parent.
- **Is there a granular fallback at the ancestor?** The pushed-down read must
  land under a `<Suspense>` whose fallback is a real, region-shaped skeleton —
  not blank, not a whole-page stand-in.

### For each `loading.tsx` / `fallback={...}` — interrogate

- **Is it granular enough?** A `loading.tsx` suspends the _entire_ segment; a
  coarse `<Suspense>` high in the tree suspends its whole subtree. If most of
  what it covers is actually static, it's too coarse.
- **Can it be decomposed into smaller fallbacks?** Push the boundary **down to
  the I/O**: let static chrome render once in the shell, and give _each_
  independent read its own `<Suspense>` reusing that component's own skeleton.

See **`levers.md`** for the before→after code for every shape.

## The loop

```
1  SCAN     node scan.mjs [appDir]  → structural inventory of the route tree:
            every dynamic-IO site, every boundary, every generateStaticParams,
            with candidate flags. Static; no install, no run.        → analysis.md
2  CLASSIFY For each flagged site, READ the file + its ancestor layouts to
            confirm (is it really top-level? is there a Suspense ancestor?),
            then map it to a lever via the framework above.          → analysis.md
3  PLAN     Propose the refactor in plan mode before editing. The mechanical
            move is named by the framework; WHERE the boundary goes, WHICH
            cacheLife profile, and HOW to extract the I/O are judgment calls.
4  REFACTOR Apply the levers.                                        → levers.md
5  VERIFY   next build on canary. Zero dynamic-IO errors AND the route table
            moved toward ○/◐. This is the oracle — re-run after every change.
6  ITERATE  Each fix can surface the next blocker (a layout await unblocks,
            revealing a page await). Repeat 1–5 until the table is maximal.
```

## The build oracle (canary)

`next build` with `cacheComponents: true` is the success signal. The errors are
the to-do list — each names a site and the lever it needs:

| Build error (substring)                                   | Lever                                                |
| --------------------------------------------------------- | ---------------------------------------------------- |
| `cookies`/`headers`/`searchParams` … `outside a Suspense` | push down + Suspense (or root-param for params)      |
| accessing **uncached** data outside Suspense              | `'use cache'` (shared) **or** Suspense (per-request) |
| `generateStaticParams` … must return at least one         | provide ≥1 param set                                 |
| request data accessed inside `'use cache'`                | move the request read out of the cached scope        |
| `couldn't be rendered statically` / blocking route        | a top-level `await` is gating the segment — defer it |

Capture build output once, read from the file (don't re-run blindly):

```bash
next build 2>&1 | tee /tmp/cc-build.log
grep -nE "Suspense|uncached|generateStaticParams|use cache|statically" /tmp/cc-build.log
```

"If it builds clean, it's correct" is the Cache Components contract — lean on it.
You do **not** need a browser to know the shell is right; you need a clean build
plus a route table that didn't collapse to `ƒ`.

## Anti-patterns

- **Don't "fix" errors by widening the boundary.** Wrapping a whole page/layout
  in one `<Suspense fallback={<Skeleton/>}>` (or `loading.tsx`) makes the build
  pass while throwing the entire page out of the shell. That's the opposite of
  the goal. Push the boundary _down_ to the I/O. (`levers.md` → granularity.)
- **Don't silence with `fallback={null}`** unless the deferred child renders
  nothing on success (a side-effect like an auth gate). An empty fallback _below_
  the root is a blank-shell bug, not a fix.
- **Don't cache request data.** `'use cache'` on a function that reads
  `cookies()`/`headers()` is a build error and a correctness bug — those reads
  stay dynamic. Cache only same-for-all-users data.
- **Don't reach for `export const dynamic`/`revalidate`.** They're deprecated
  under Cache Components; the levers replace them.

## Self-eval (prove the skill is doing the work)

`eval/` is a **differential** headless harness. It runs the same headless
`claude -p` on the same broken app **twice** — once without the skill, once
pointed at it — and scores the result **statically** (re-run `scan.mjs` + parse
the build) in two tiers: **CORRECT** (builds ∧ kept `cacheComponents` ∧ kept
routes ∧ 0 HIGH ∧ `generateStaticParams` ∧ `'use cache'` ∧ a real granular
fallback) and **QUALITY** (CORRECT ∧ `cacheLife` ∧ `cacheTag`). The skill is
differentiating when with-skill reaches a strictly higher tier.

Observed (next@16.3.0-canary.40): baseline ❌ → **no-skill = CORRECT** (maximal
shell but crude, un-invalidatable caching) → **with-skill = QUALITY** ✅. A
strong unaided agent gets the shell, but caches without `cacheLife`/`cacheTag`
(stale-forever, no invalidation) and tends to recreate the shell in fallbacks;
the skill fixes both.

```bash
node skills/next-dynamic-io-refactor/eval/run.mjs --next 16.3.0-canary.40   # differential
node skills/next-dynamic-io-refactor/eval/run.mjs --baseline-only           # prove the messy app breaks
node skills/next-dynamic-io-refactor/eval/run.mjs --rescore <workdir>       # re-score a prior run
```

> The default `--next canary` may be a build with a Cache Components regression
> (e.g. **canary.41** crashes prerendering internal pages). Pin a known-good
> build with `--next`. See `eval/README.md`.

See `eval/README.md`.

## Files

- `scan.mjs` — dependency-free structural scanner. Emits the route-tree +
  dynamic-IO site + boundary inventory as JSON. The static-analysis engine.
- `analysis.md` — how to run the scan, read its flags, and do the per-site
  confirmation (boundary ancestry, top-level vs nested) the scan can't.
- `levers.md` — before→after refactor recipe for every dynamic-IO shape, mapped
  to the framework's questions.
- `eval/` — the headless self-eval harness (messy fixture + `claude -p` runner +
  build oracle) on next@canary.

## Related

- `next-cache-components-optimizer` / instant-shell rigs — the **runtime**
  counterpart: measure an already-building app's shell/nav with `instant()`.
  Reach for those once this skill has the app building; reach for this one when
  the app doesn't build or you want a source-level audit. They are complementary,
  not substitutes.
- The `cache-components` plugin docs — the API reference (`'use cache'`,
  `cacheLife`, `cacheTag`, `generateStaticParams`) this skill assumes.
