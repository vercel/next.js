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
phases P → G in order; each ends in a gate. Fix recipes live in two lazily-read
references — `reference/patterns.md` (before→after for each blocker type) and
`reference/real-app-patterns.md` (parallel routes, auth gates, the empty-shell
and responsive-skeleton failure modes). Read one only when its phase points
there.

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
- **The mechanism: `@next/playwright` `instant()`.** This skill locks with
  [`instant()`](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/instant#testing-instant-navigation):
  a ruler, not a stopwatch (phase A). It comes from
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
can differ; guard the one you ship, both when both matter
(`reference/real-app-patterns.md`).

## Goal

Maximizing the static shell is the optimization objective: the most meaningful
prerendered content commits immediately, and only genuinely per-request data
streams in afterward. The shipped test deterministically encodes **present ∧
instant**; **non-blank** is the additional bar the workflow enforces by
judgment (D1/D2/E), because an `instant()` pass alone is satisfied by a blank
`fallback={null}` shell (the empty-shell failure mode,
`reference/real-app-patterns.md`).

`instant()` is a ruler, not a stopwatch: assert that the shell appears under
the lock; do not time it. A trustworthy verdict requires a production build
(phase A).

The GREEN under the lock is the deterministic verdict; each gate keeps it
trustworthy.

## Reporting to the user

This loop is meant to run unattended — ideally across many navigations in one
pass — so it doesn't stop to ask after each route. What matters is how you word
and present the results, not how often you interrupt. The mechanics below — the
rig, RED, GREEN, the gates — are your scaffolding; the user never needs to hear
those words.

- **Speak their language.** Describe the gap and the result in terms of what the
  user sees: "navigating to the dashboard waited on the charts query before
  anything painted; now the layout and skeletons paint instantly and the charts
  stream in" — not RED/GREEN, the lock, or the phase letters.
- **Show, don't tell.** When you report a route, drive the browser (or attach
  before/after screenshots) so the user watches the shell commit immediately and
  the data stream in, rather than reading a claim. Identical before and after
  means the fix did nothing — roll it back.
- **Present a run as a list of results,** one line per navigation — which route,
  what's now instant, what streams — not a transcript of the loop.
- **Only surface a question for a genuine fork:** a fix that would change
  behavior, a security-sensitive read, or a route that's dynamic by design (a
  runtime-prefetch candidate, not a shell to grow). A clean instant fix is not a
  fork — keep going. With no one to ask (an unattended run), don't block: take
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
- [ ] D  FIX          push each Suspense boundary down to the data it guards → reference/patterns.md
- [ ]      D1 reuse the route's existing loading UI; do not hand-build skeletons
- [ ]      D2 the shell matches the real render at every breakpoint  → reference/real-app-patterns.md
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

**The anti-pattern: one coarse boundary.** A single `<Suspense>` high in the
tree with a page-level fallback has three costs:

- The layout UI stays out of the static shell: only a throwaway copy of it is
  prerendered.
- The entire subtree is replaced when the boundary resolves, which discards
  client state and shifts layout.
- The hand-built fallback drifts out of sync as the UI changes, because it
  duplicates structure that also exists in the resolved tree.

**The fix: hoist the static, push the Suspense down.** Render the layout UI
once, synchronously, in the shell, and wrap each await in a boundary scoped to
the single read it guards. Only that leaf streams; the stable ancestors are
reused as-is.

**Rule:** if an element renders in both the fallback and the resolved tree,
hoist it above the boundary.

### The most common blocker: a top-level `await` in a layout on a fallback route

```
app/[locale]/(app)/[tenant]/dashboard/...
       │ generateStaticParams ✅   │ no generateStaticParams → fallback route
```

When any dynamic segment in the route lacks `generateStaticParams`, the route
is a fallback route, and **all** params defer to request time, including the
enumerated ones. A top-level `await` in a layout (`await params`, a
request-time session read, an auth gate) then blocks the whole subtree out of
the static shell, even when it reads a statically known param. Minimal shape: a
dynamic-segment route with one segment lacking `generateStaticParams`, plus a
top-level `await` in the layout above it.

### The fix: defer the gate, render children

Render `children` unconditionally; move the top-level `await` into a
`<Suspense fallback={null}>`-wrapped child. Mechanism and before→after:
`reference/real-app-patterns.md`, "Deferring an auth gate".

**Fix the page below the shell too, not only the layout.** A page-level
top-level `await` (commonly `await params`) blocks the same way the layout's
does, so make the page sync and push its dynamic reads into a
`<Suspense>`-wrapped leaf as well. `fallback={null}` is correct only when a gate renders nothing on
success; for data, the fallback must be a real loading skeleton (see D1).

Every other blocker shape — `cookies()`/`headers()`, uncached fetch or database
reads, `searchParams`, metadata, viewport, non-deterministic values (`Date.now()`,
`Math.random()`, `crypto.randomUUID()`) — surfaces its own insight when you hit
it: the build prints a `https://nextjs.org/docs/messages/<slug>` link. The
default build output is often abbreviated and may carry no usable stack trace;
add `--debug-prerender` for the full failing frame and to report every blocker
past the first. Scope the build to the route you're on with
`next build --debug-build-paths "app/<route>/**"` rather than rebuilding the app.
Open that page and apply its recipe; don't improvise from the inline message.

The before→after recipe for each shape is in `reference/patterns.md`, which maps it to the insight
that explains it.

A few things those per-error pages don't stress for the instant-navigation goal:

- **A boundary in the root layout isn't enough for client navigations.** It
  passes a page-load check but leaves sibling client navigations blocking; put
  the boundary below the lowest layout the source and destination routes share.
- **Keep the LCP element** (usually the main heading) out of any boundary, so it
  paints in the shell instead of waiting on a stream.
- **A green check isn't always instant.** `export const instant = false` opts
  the segment out of validation while the navigation still blocks, and a
  `<Suspense>` above the document `<body>` prerenders an empty shell — neither
  makes the route instant.

### D1: reuse the route's existing loading UI; do not hand-build skeletons

Before writing any skeleton, search the repository for the loading UI that
already exists for this route, in order:

1. the route's `loading.tsx`;
2. an exported `*Skeleton` colocated with the component;
3. the fallback already inside the component's own `<Suspense>`.

The **divergence point** is the lowest layout shared by the source and
destination routes: a soft navigation re-renders only the segments below it,
while an initial load re-runs every layout from the root. (Also called the
shared boundary.) A `loading.tsx` above the divergence point fills only
the initial-load shell; it sits above the soft-nav re-render scope. A
`loading.tsx` at the destination segment is itself the in-tree boundary for a
soft navigation into that segment and serves both. Reuse whichever boundary
actually covers the navigation you are shipping; below the divergence point,
`loading.tsx` and colocated skeletons are interchangeable for that purpose.

If a component has no skeleton, extract its loading markup into a colocated
skeleton beside it. Do not author a fresh skeleton that mirrors the page
layout: it duplicates structure, drifts as the page changes, and pulls the
design back toward a single coarse boundary. Reusing the component's own
skeleton also keeps the prefetched shell consistent with the loaded UI.

Exception: if the deferred component renders `null` for some users (for
example, a flag-gated control), `fallback={null}` is correct, since a skeleton
would flash and then collapse.

### D2: the shell must match the real render at every breakpoint

A skeleton frozen to one breakpoint misaligns on the others. Fix it the same
way: one responsive component renders both the live UI and the shell (D1
skeleton in its data slots), so the breakpoint switch happens once. Verify by
re-asserting the shell marker at two widths
(`await page.setViewportSize({ width: 1280, height: 800 })`, then
`{ width: 390, height: 844 }`), or by adding a mobile Playwright project, so
this gate is as machine-checkable as the others. Detail:
`reference/real-app-patterns.md`.

> **D-gate: phase D is complete when the locked test from phase C passes GREEN
> under the lock on the production-build rig**, not when the code compiles. That
> GREEN is the deterministic stop for the fix loop; proceed to E.

**When the read can't be pushed down** (an ID minted per request, an
all-dynamic page, a per-request auth/scope read the whole subtree needs), there
is no shell to grow. Don't force one: opt the route into **runtime prefetching**
so the prefetch runs the dynamic render ahead of the click and the soft nav
commits the real content. See [Runtime Prefetching](https://nextjs.org/docs/app/guides/runtime-prefetching)
for the mechanism (`prefetch = 'allow-runtime'` on the route plus a full
`<Link prefetch={true}>`) and the [dynamic-data-during-prefetching insight](https://nextjs.org/docs/messages/instant-link-prefetch-partial)
for adoption. The `instant()`-specific gotchas the docs don't cover:

- **The full prefetch is mandatory.** An auto/PPR prefetch bails before the
  runtime spawn (`subtreeHasSpeculativePrefetch`); only `prefetch={true}` /
  `kind: 'full'` reaches it. If you set `prefetch = 'allow-runtime'` and it's
  still RED, the link is doing an auto prefetch.
- **All leaf slots must agree.** `allow-runtime` on the content segment but
  nothing on a sibling `@header`/`@sidebar` leaf leaves the route's runtime entry
  incomplete, so the lock falls back to the shell. Flip every leaf together.
- **Prefetch the canonical URL.** A link whose href 307-redirects can't be
  prefetched — the prefetch receives the redirect, not the tree. Point the link
  and the prefetch at the final URL.
- **Don't blanket the full prefetch.** It fetches _all_ the target's dynamic
  data; issuing it on hover for every link is wasteful. Scope `kind: 'full'` to
  the runtime-prefetch targets only.
- **Marker must be a committed node, not RSC bytes.** The content is often a
  client component, so its text isn't in the prefetch response. Assert a
  `data-testid` that renders when the client subtree commits.

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
- **Both viewports reach the real UI** after the stream (D2).
- **Client state survives.** Because the layout UI is hoisted into the stable
  shell rather than swapped on resolve, open menus, scroll position, focus,
  and input state persist across the stream.

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
- [ ] **Existing loading UI reused (D1)**: no new page-mirroring skeleton.
- [ ] **Shell matches the real render at desktop and mobile widths (D2)**.

**Stop condition for the whole workflow:** the locked test from C is GREEN on
the rig, the differential (F) holds, and every item above is checked. Until all
three hold, you are not done.

## Driving the navigation in tests

- **Soft navigation** → drive a real `<Link>` click. **Initial load** → use
  `page.goto()` inside `instant()` with the `baseURL` option. Do not substitute
  `goto` for a soft-nav verdict; the two shells can differ
  (`test-template.md`, `reference/real-app-patterns.md`).
- With parallel routes, only the slots that change re-render on a soft
  navigation; client-rendered navigation UI does not re-render at all. Do not
  chase a slot the navigation never touches
  (`reference/real-app-patterns.md`).

## Files

- `rig-template.md`: phase 0, the six-question rig discovery, the
  `instant-nav.rig.md` template, and filled examples (local-only, generic CI,
  preview deploy).
- `test-template.md`: the shipped `instant()` specs for both navigation
  types (phase C), and the delete-before-PR baseline scaffold (phase B).
- `reference/red-test-robustness.md`: the C-gate and phase F. The taxonomy of
  untrustworthy REDs, the checklist, the differential recipe, the vacuous-pass
  failure mode, and worked cases.
- `reference/real-app-patterns.md`: parallel routes, deferring an auth gate,
  initial-load vs soft-navigation shells, the empty-shell failure mode, the
  responsive-skeleton mismatch, edge cases.
