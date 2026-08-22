---
name: next-cache-components-optimizer
description: >
  Drive a Next.js route to instant navigation by setting up an agentic loop,
  under Cache Components / PPR, on initial load (hard navigation) and
  client-side navigation (soft navigation). Encode the goal as a failing
  @next/playwright instant() e2e and work it to green, one verified route at a
  time; the shipped test then guards against regression. Use when asked to make
  a route's navigation instant (its static shell commits immediately), fix a
  route whose static shell isn't prerendered/served/prefetched, grow a route's
  static shell or fix its slow first paint, diagnose which Suspense boundary
  keeps a route out of its static shell, or write the instant() e2e guard for
  one. Requires Next.js 16.3+ with cacheComponents; directs an upgrade if older.
---

# next-cache-components-optimizer

Set up an agentic optimization loop that drives a Next.js route from "not
instant" to "instant" and keeps it there. The loop is test-driven: encode the
goal as a failing `@next/playwright` `instant()` test, work it to green, and
ship the test as the regression guard. Run it once per target route. Work the
phases P → G in order; each ends in a gate. Use
[Optimizing the static shell](https://nextjs.org/docs/app/guides/optimizing-the-static-shell)
for the framework refactor patterns. Keep this skill focused on the production
test rig, trustworthy RED, optimization loop, parity, and differential.

## What is invariant, and what is yours

One thing here is fixed. The rest is yours. Read this before treating any
command, platform, or env var below as a requirement.

- **Invariant: the verification loop.** Maximizing the shell is worthless
  unless you can prove it. The proof is an automated check: under a lock that
  gates dynamic data, the static shell still commits. RED shows the gap, GREEN
  shows it closed, the test ships as the regression guard. It must run on a
  production-like build and must not be able to pass vacuously. Stand the loop
  up once; every later optimization is then verifiable by construction. The
  loop is the deliverable, not any one route.
- **The mechanism: `@next/playwright` `instant()`.** This skill uses
  [`instant()`](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests)
  as a ruler, not a stopwatch (phase A). It comes from
  `@next/playwright` (installed alongside `@playwright/test`, on the same
  release line as `next`), so it isn't tied to any host. Keep it. Timing a
  navigation by hand is too flaky to trust, and is the failure mode this skill
  exists to prevent.
- **Yours: the rig.** How you build, deploy, authenticate, configure
  Playwright, and loop belongs to your stack, not to this skill. A local
  `next build && next start`, a CI/staging container, and a per-push preview
  deploy are equally valid rigs; the verdict comes from the build, never the
  platform. Phase 0 maps the invariant onto your repo. Read every platform
  name, env-var spelling, and command below as an example to translate, not a
  requirement.

## Two navigations, two loading states

A route reaches the user two ways, and both must be instant:

- **Initial load (hard navigation)** commits the route's prerendered static
  shell; deferred parts stream in behind their loading skeletons (Suspense
  fallbacks, `loading.tsx`).
- **Client-side navigation (soft navigation)** commits the destination's
  prefetched App Shell — the `<Link>` default under Partial Prefetching —
  re-rendering only the segments that change.

The fix patterns are identical for both; the test differs only in how the
navigation is driven ("Driving the navigation in tests" below). The two shells
can differ. Guard the one you ship, or both when both matter. See
[What "instant" means](https://nextjs.org/docs/app/guides/instant-navigation#what-instant-means)
for the initial-load and client-navigation model.

## Goal

Maximizing the static shell is the optimization objective: the most meaningful
prerendered content commits immediately, and only genuinely per-request data
streams in afterward. The shipped test deterministically encodes **present ∧
instant**; **non-blank** is the additional bar the workflow enforces by
judgment in phases D and E, because an `instant()` pass alone is satisfied by a
blank `fallback={null}` shell.

`instant()` is a ruler, not a stopwatch: assert that the shell appears under
the lock; do not time it. A trustworthy verdict requires a production build
(phase A).

The GREEN under the lock is the deterministic verdict; each gate keeps it
trustworthy.

## Reporting to the user

This loop is meant to run unattended, so it doesn't stop to ask between steps.
Work the navigation the user named, finish it, and stop. What matters is how you
word and present the results, not how often you interrupt. The mechanics below —
the rig, RED, GREEN, the gates — are your scaffolding; the user never needs to
hear those words.

- **Speak their language.** Describe the gap and the result in terms of what the
  user sees: "navigating to the dashboard waited on the charts query before
  anything painted; now the layout and skeletons paint instantly and the charts
  stream in" — not RED/GREEN, the lock, or the phase letters.
- **Show, don't tell.** When you report a route, drive the browser (or attach
  before/after screenshots) so the user watches the shell commit immediately and
  the data stream in, rather than reading a claim. Identical before and after
  means the fix did nothing — roll it back.
- **Present a run as a list of results the user can click through** — one line
  per navigation: the route, what commits instantly, and what streams in — not a
  transcript of the loop.
- **Only surface a question for a genuine fork:** a fix that would change
  behavior, a security-sensitive read, or a route that's dynamic by design (a
  per-link-prefetch candidate, not a shell to grow). A clean instant fix is not
  a fork — keep going. With no one to ask (an unattended run), don't block: take
  the safe default and note the assumption — for a cache-freshness choice,
  defer the read behind `<Suspense>` (always fresh, still instant) rather than
  guess a `cacheLife`.

## The workflow

```
- [ ] P  PREREQS      Next.js 16.3+ with cacheComponents: true; upgrade first → below
- [ ] 0  SETUP        once per repo: discover + write instant-nav.rig.md     → rig-template.md
- [ ] A  RIG          production build with the testing API exposed          → below
- [ ] B  BASELINE     unlocked: the marker renders for the test user         → test-template.md
- [ ] C  RED          locked instant(): the shell does not commit            → test-template.md
- [ ] C-gate          VERIFY-RED: stop until the RED is trustworthy          → reference/red-test-robustness.md
- [ ] D  FIX          apply the public static-shell patterns to reach GREEN
- [ ]      reuse existing loading UI; do not hand-build page skeletons
- [ ]      match the completed render at every supported breakpoint
- [ ] E  PARITY       the refactor changed only whether the route is instant
- [ ] F  DIFFERENTIAL revert only the fix → RED; re-apply → GREEN            → reference/red-test-robustness.md
- [ ] G  REVIEW       PR checklist (below)
```

Phases B and C build the test; only the locked test from C ships.

---

## P. PREREQUISITES: current Next.js with Cache Components

The workflow depends on framework capabilities that ship with current Next.js:

- **Next.js 16.3+ with `cacheComponents: true`** in `next.config.ts`. Without
  Cache Components there is no static shell to optimize.
- **`@next/playwright`** on the same release line as the project's `next`; it
  provides `instant()`. Verify with `npm ls next @next/playwright` (or the
  project's package manager) and align them if they differ. The matching
  testing API is in the `next` runtime, gated by the
  `experimental.exposeTestingApiInProductionBuild` config flag (phase A).

If the project does not meet these, upgrade first (`npx @next/codemod upgrade`
automates most of it), then enable Cache Components in `next.config.ts`:

```ts
export default { cacheComponents: true }
```

Enabling the flag surfaces the blocking routes to resolve first; the
[`next-cache-components-adoption`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-adoption)
skill drives that adoption. Reach for this optimizer once the app builds under
Cache Components.

This gate is deliberate: the skill targets current Next.js, and none of the
verdicts below are meaningful on older versions.

## 0. SETUP: discover this project's rig, once per repo

The principles in this skill are fixed; the infrastructure they run on is
yours. On first use in a repository, discover how the project builds, deploys,
authenticates, and tests (inspect the repository first, and ask the user only
what it cannot answer), then write the answers to a committed
`instant-nav.rig.md`. Every later run reads that file instead of
rediscovering. The six questions (BUILD / EXPOSE / RUN / TEST USER / DRIFT /
LOOP), the file template, and filled examples (local-only, generic CI +
container, preview deploy) are in **`rig-template.md`**.

If the repo has no Playwright e2e harness yet, standing up a minimal one
(`@next/playwright`, a config with `baseURL`, one authenticated path) is part
of this step; the loop does not assume a pre-existing suite.

## A. RIG: a production build with the testing API exposed

Stand up the rig described by `instant-nav.rig.md`. Two invariants hold on
every platform:

1. **Never measure on `next dev`.** It does not prefetch, and its lock is
   unreliable for blocking routes, so a dev `instant()` result is not a valid
   RED or GREEN.
2. **The measured build must expose the testing API.** Otherwise `instant()`
   silently no-ops and the test passes vacuously (see
   `reference/red-test-robustness.md`). The lock-engagement proof is the phase-C
   RED itself: the unfixed target route is the known-blocking route, and its
   RED under the lock shows the lock engages on this build (C-gate); the
   self-validating variant in `test-template.md` is the in-band guarantee. Wire
   `experimental.exposeTestingApiInProductionBuild` to a condition that is
   true for every build you measure and never true in production:

   ```ts
   experimental: {
     // Use the condition your platform provides, and record it in the rig file:
     //   local:       an explicit opt-in, as below
     //   generic CI:  process.env.DEPLOY_ENV === 'staging'
     //   Vercel:      process.env.VERCEL_ENV === 'preview'
     exposeTestingApiInProductionBuild:
       process.env.EXPOSE_TESTING_API === '1',
   }
   ```

The rig is any production-like build that exposes the testing API: a local
`next build && next start`, a CI/staging container, and a preview deploy are
all equally valid; the verdict comes from the build, not the platform. See
`rig-template.md` for filled examples.

For any deployed or remote build, poll the rig's LIVENESS probe to confirm the
artifact contains `HEAD` before trusting a verdict (a stale deploy reads as a
false RED or GREEN); a local `next build && next start` needs none. The probe
mechanism is in `rig-template.md` (question 6).

## B. BASELINE (unlocked): development scaffold, do not ship

Drive the real navigation with no `instant()` lock and assert that the
destination's `SHELL_MARKER` renders **as the test user**: the account the
e2e suite authenticates as (in CI, the CI account; locally, your e2e login
fixture), with its flags, plan, role, and data. This establishes that the
marker is real and reachable: not flag-gated, not redirected away, not a
guessed selector. The suite runs as the test account, not the author's session;
that environment drift (the rig DRIFT list) is a common source of
untrustworthy REDs. Scaffold and run command: **`test-template.md`**.
**Delete this baseline before the PR.**

## C. RED (locked) + the VERIFY-RED gate

Wrap the same navigation in `instant()`; assert the shell commits under the
lock. A RED here is the gap. **This is the test that ships**
(`test-template.md`).

Prefer the self-validating variant when the route has deferred content. If the
route cannot build while blocked, or a cookie/session read stays GREEN, use the
RED recipes in `reference/red-test-robustness.md`.

> **C-gate: do not start optimizing until the RED is verified trustworthy.** A
> RED that is red for the wrong reason sends you optimizing a route that was
> never broken.

The question that settles it: **does `SHELL_MARKER` render without the lock,
as the test user?** Answer it by re-running phase B as the test user, not by
adding assertions to the shipped test. The two-branch resolution (No → marker
or environment bug; Yes → genuine gap, proceed to D), the full taxonomy of
untrustworthy REDs, the checklist, and worked cases are in
**`reference/red-test-robustness.md`**. Read it now.

---

## D. FIX: push each boundary down to the data it guards

Read
[Optimizing the static shell](https://nextjs.org/docs/app/guides/optimizing-the-static-shell)
before editing the route. Apply the matching public pattern for the blocker:

- [Choose what belongs in the static shell](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#step-1-choose-what-belongs-in-the-static-shell).
- [Keep the layout visible while authentication resolves](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#step-2-keep-the-layout-visible-while-authentication-resolves).
- [Move request-time work into a focused boundary](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#step-3-move-request-time-work-into-a-focused-boundary).
- [Cache data that can be reused](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#step-4-cache-data-that-can-be-reused).
- [Reuse existing loading states](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#reuse-existing-loading-states).
- [Place boundaries in the segments that change](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#place-boundaries-in-the-segments-that-change).
- [Keep loading states responsive](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#keep-loading-states-responsive).

Run the route's scoped build after each edit. Every blocker prints a canonical
`https://nextjs.org/docs/messages/<slug>` link for its exact API, including
runtime data, uncached data, metadata, viewport, and nondeterministic values.
Open that page instead of copying a generic recipe into the skill. See
[Building your application](https://nextjs.org/docs/app/guides/building) for
the route table and production build workflow. Use `--debug-prerender` when
the abbreviated output lacks the failing frame, and use
`--debug-build-paths "app/<route>/**"` to keep the loop scoped.

When the public pattern does not explain the observed shell, check these
production route shapes:

- If a marker is present after a `<Link>` click but missing after `page.goto()`,
  inspect layouts above the shared boundary for `await params` or
  `await searchParams`. An initial load rerenders those parents. A client
  navigation can keep them mounted. When a parameter is not enumerated by
  `generateStaticParams`, move its read behind a focused boundary in every
  render path that needs it, then verify both navigation types.
- React `cache()` and custom memoization can deduplicate `cookies()` or
  `headers()` reads, but they do not make request data available during
  prerendering. Keep the read behind `<Suspense>`, or apply the public
  authentication and caching patterns when session-derived data can be reused.

Keep the primary heading or other meaningful marker in the shell when its data
can be static or cached. A blank `fallback={null}` can pass `instant()` without
providing useful output. Use an empty fallback only when the resolved component
also renders nothing.

Verify the shell at the route's supported breakpoints. Prefer the project's
existing mobile Playwright project; otherwise set the desktop and mobile
viewport sizes in the focused test.

> **D-gate: phase D is complete when the locked test from phase C passes GREEN
> under the lock on the production-build rig**, not when the code compiles. That
> GREEN is the deterministic stop for the fix loop; proceed to E.

**When URL data can't be pushed down** (for example, the whole page depends on
`params`, `searchParams`, or the full URL), there may be no meaningful static
shell to grow. Don't force one. Per-link prefetching can make the soft
navigation instant, but it is outside this optimizer loop: it requires Partial
Prefetching, a `<Link prefetch={true}>`, and cached URL-dependent content. See
[Optimizing prefetching](https://nextjs.org/docs/app/guides/optimizing-prefetching)
for the requirements and server-cost trade-offs.

## E. PARITY: the refactor changed only whether the route is instant

The push-down is a mechanical transform, not a redesign. Afterward the route
must render the same tree, data, ordering, empty and error states, redirects,
and interactions as before; the only observable difference is that the shell
now commits instantly. Verify:

- **Same render output.** The moved `await`s compute and return the same
  values; after the stream, the route shows the same content as the base
  branch for the test user.
- **Side effects still fire.** A deferred `redirect()` or `notFound()` still
  happens, at request time rather than during prerender. Confirm an
  unauthorized user is still redirected and a missing record still returns 404.
- **All supported viewports reach the real UI** after the stream.
- **Client state survives.** Because the layout UI is hoisted into the stable
  shell rather than swapped on resolve, open menus, scroll position, focus,
  and input state persist across the stream.
- **Pre-existing failures stay separate.** If the route errors after the
  change, reproduce it on the base branch. The same failure there is an
  environment or data problem, not an optimizer regression.

If anything other than whether the route is instant changed, reduce the refactor.

## F. DIFFERENTIAL

Revert only the fix → RED; re-apply → GREEN; link both runs
(`reference/red-test-robustness.md`). On a deployed rig, confirm each run is live
(LIVENESS, phase A) before trusting its color.

## G. REVIEW (PR checklist)

A green final state means nothing if the RED was never trustworthy. The
test-trustworthiness items are the robustness checklist
(`reference/red-test-robustness.md`); confirm them, then require these
PR-specific items:

- [ ] **Differential shown**: RED without the fix, GREEN with it, runs linked.
- [ ] **Parity confirmed (E)**: same content, redirects, and state.
- [ ] **Existing loading UI reused**: no new page-mirroring skeleton.
- [ ] **Shell matches the real render at supported desktop and mobile widths**.
- [ ] **Baseline removed**: only the locked test from C remains.

**Stop condition for the whole workflow:** the locked test from C is GREEN on
the rig, the differential (F) holds, and every item above is checked. Until all
three hold, you are not done.

## Driving the navigation in tests

- **Soft navigation** → drive a real `<Link>` click. **Initial load** → use
  `page.goto()` inside `instant()` with the `baseURL` option. Do not substitute
  `goto` for a soft-nav verdict; the two shells can differ. See
  [Instant Navigation testing](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests)
  and `test-template.md`.
- With parallel routes, only the slots that change re-render on a soft
  navigation. Do not chase a server slot the navigation never touches. A
  Client Component in the shared layout can update from `usePathname()`, but it
  is outside the destination's server render.

## Files

- `rig-template.md`: phase 0, the six-question rig discovery, the
  `instant-nav.rig.md` template, and filled examples (local-only, generic CI,
  preview deploy).
- `test-template.md`: the shipped `instant()` specs for both navigation
  types (phase C), and the delete-before-PR baseline scaffold (phase B).
- `reference/red-test-robustness.md`: the C-gate and phase F. The taxonomy of
  untrustworthy REDs, the checklist, the differential recipe, the vacuous-pass
  failure mode, and worked cases.

## After optimization

Once the target routes are instant, check whether the app has already adopted
Partial Prefetching (`partialPrefetching: true`, or the relevant destination
still uses `prefetch = 'partial'` during an incremental rollout).

Make that check mechanically:

```bash
rg -n "partialPrefetching|prefetch\s*=\s*['\"]partial['\"]" --glob 'next.config.*' --glob 'app/**' --glob 'src/app/**'
```

If `partialPrefetching: true` is in config, the app is globally adopted. If only
`prefetch = 'partial'` matches, treat those destination segments as adopted
during an incremental rollout and keep checking any other target routes.

- **Already adopted:** for any URL-data route that stopped at the limitation
  above, consider a targeted `<Link prefetch={true}>` on the links where having
  that URL-specific content ready before the click is worth the per-link server
  work. Keep the default link behavior everywhere else so the shared App Shell
  remains the low-cost baseline. Apply the documented
  [trade-offs](https://nextjs.org/docs/app/guides/optimizing-prefetching#trade-offs)
  and use [hover-triggered prefetching](https://nextjs.org/docs/app/guides/prefetching#hover-triggered-prefetch)
  when many links are visible.
- **Not adopted yet:** recommend
  [`next-partial-prefetching-adoption`](https://github.com/vercel/next.js/tree/canary/skills/next-partial-prefetching-adoption).
  That skill moves the app onto the better prefetching model: shared App Shell
  prefetches by default, fewer duplicated full-prefetch requests for visible
  links, a link audit for existing `<Link prefetch={true}>` usage, and optional
  per-link prefetching only where URL-specific content is worth the
  extra server work.
