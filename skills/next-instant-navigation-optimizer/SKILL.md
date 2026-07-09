---
name: next-instant-navigation-optimizer
description: >
  Drive a Next.js route to instant navigation by setting up an agentic loop,
  under Cache Components / PPR, including Partial Prefetching, on initial load
  (hard navigation) and client-side navigation (soft navigation). Encode the goal as
  a failing @next/playwright instant() e2e and work it to green, one verified
  route at a time; the shipped test then guards against regression. Use when
  asked to make a route's navigation instant, grow its static shell or App
  Shell, fix its slow first paint, diagnose which Suspense boundary keeps it
  out of the immediate UI, enable the partialPrefetching config, add a route's
  prefetch = 'partial' export, audit how an inbound Link prefetches it, or write
  the instant() e2e guard. Requires Next.js 16+ with cacheComponents; Partial
  Prefetching paths require 16.3+.
---

# next-instant-navigation-optimizer

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

- **Invariant — the verification loop.** Maximizing the immediate UI is
  worthless unless you can prove it. The proof is an automated check: under a
  lock that gates data outside the active prefetch contract, the expected
  static shell, App Shell, or extended prefetched UI still commits. RED shows
  the gap, GREEN shows it closed, and the test ships as the regression guard.
  It must run on a production-like build and must not be able to pass
  vacuously. Stand the loop up once; every later optimization is then
  verifiable by construction. The loop is the deliverable, not any one route.
- **The mechanism — `@next/playwright` `instant()`.** This skill locks with
  Next.js's own `instant()`: a ruler, not a stopwatch (phase A). It ships with
  `next`, so it is not tied to any host. Keep it. Timing a navigation by hand
  is too flaky to trust, and is the failure mode this skill exists to prevent.
- **Yours — the rig.** How you build, deploy, authenticate, configure
  Playwright, and loop belongs to your stack, not to this skill. A local
  `next build && next start`, a CI/staging container, and a per-push preview
  deploy are equally valid rigs; the verdict comes from the build, never the
  platform. Phase 0 maps the invariant onto your repo. Read every platform
  name, env-var spelling, and command below as an example to translate, not a
  requirement.

## Two navigations, two loading states

A route reaches the user in two ways. Both must be instant:

- **Initial load (hard navigation).** The browser requests the document. With
  PPR, the server responds with a concrete URL-specific **static shell** when
  one was prerendered. With Cache Components, an ungenerated URL can instead
  use the reusable **App Shell** as its direct-visit/ISR fallback, independent
  of whether Partial Prefetching is enabled for links.
  Dynamic content streams into either shell afterward. The loading state is
  the layout UI plus the loading skeletons (Suspense fallbacks, `loading.tsx`)
  of the deferred parts.
- **Client-side navigation (soft navigation).** The router commits the
  destination's prefetched UI when the link is activated; only the route
  segments that change re-render, and unresolved data streams in afterward.
  Under Partial Prefetching, a default `<Link>` commits the route's reusable
  **App Shell**. A link with `prefetch={true}` may commit additional cached or
  runtime-prefetched content. The loading state is whatever that real link's
  prefetch contract makes available, not necessarily the static document shell.

The fix patterns are identical for both. The test differs only in how the
navigation is driven (see "Driving the navigation in tests" below). The two
immediate UIs can differ; guard the one you ship, both when both matter
(`reference/real-app-patterns.md`).

## Know the prefetch contract before testing

`instant()` follows the clicked link's configured fetch strategy. Record the
contract before choosing a marker or interpreting RED/GREEN:

| Destination and link                                                          | Real production prefetch                                  | UI available under `instant()`                                |
| ----------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| No Partial Prefetching + default/auto `<Link>`                                | Legacy cached-page prefetch                               | Corresponding cached-page UI                                  |
| No Partial Prefetching + `<Link prefetch={true}>`                             | Legacy full prefetch, including dynamic data              | Corresponding full-prefetch UI                                |
| Partial Prefetching + default/auto `<Link>`                                   | Shared per-route App Shell                                | App Shell                                                     |
| Partial Prefetching + `<Link prefetch={true}>`                                | App Shell plus cached page content                        | App Shell plus cached page content                            |
| Partial Prefetching + `prefetch = 'allow-runtime'` + `<Link prefetch={true}>` | Above, plus eligible per-link runtime data                | Above, plus eligible `params`/`searchParams`/full-URL content |
| `prefetch = 'force-disabled'`                                                 | Skipped unless an ancestor runtime-prefetches the subtree | Absent unless carried by that ancestor response               |
| `<Link prefetch={false}>`                                                     | No real production segment prefetch                       | A controlled navigation prefetch may still expose a shell     |

Cookies and headers may already produce a session-specific App Shell; they do
not by themselves require `allow-runtime`. With Partial Prefetching active,
fresh uncached reads and work gated by `connection()` stay deferred. A legacy
`prefetch={true}` contract can include dynamic data, so do not apply that rule
to the legacy rows.

Important: the testing lock initiates and awaits a controlled navigation
prefetch even for `prefetch={false}`. Therefore a green `instant()` test proves
what can commit under the lock, but does **not** by itself prove that the real
link prefetched anything before the click. When the task includes Partial
Prefetching adoption, separately establish the route/Link policy in phase A1;
use network/protocol observation too if actual delivery is part of the goal.

## Goal

Maximizing the useful immediate UI is the optimization objective: meaningful
static or prefetched content commits immediately, and only content outside the
chosen contract streams in afterward. The shipped test deterministically
encodes **present ∧ instant**; **non-blank** is the additional bar the workflow
enforces by judgment (D1/D2/E), because an `instant()` pass alone is satisfied
by a blank `fallback={null}` shell (the empty-shell failure mode,
`reference/real-app-patterns.md`).

`instant()` is a ruler, not a stopwatch: assert that the expected immediate UI
appears under the lock; do not time it. A trustworthy verdict requires a
production build (phase A).

The GREEN under the lock is the deterministic verdict; each gate keeps it
trustworthy.

## The workflow

```
- [ ] P  PREREQS      Next.js 16+ with cacheComponents; 16.3+ for Partial Prefetching
- [ ] 0  SETUP        once per repo: discover + write instant-nav.rig.md     → rig-template.md
- [ ] A  RIG          production build with the testing API exposed          → below
- [ ] A1 CONTRACT     record destination config + the real Link's prefetch policy
- [ ] B  BASELINE     unlocked: the marker renders for the test user         → test-template.md
- [ ] C  VERDICT      locked instant(): structural RED or policy-only GREEN  → test-template.md
- [ ] C-gate          VERIFY-RED for the structural branch only              → reference/red-test-robustness.md
- [ ] D  FIX          structural branch: push Suspense down; policy-only skips → reference/patterns.md
- [ ]      D1 reuse the route's existing loading UI; do not hand-build skeletons
- [ ]      D2 the shell matches the real render at every breakpoint  → reference/real-app-patterns.md
- [ ] E  PARITY       preserve render/interaction behavior; record policy changes
- [ ] F  EVIDENCE     structural RED/GREEN or policy before/after evidence    → reference/red-test-robustness.md
- [ ] G  REVIEW       PR checklist (below)
```

Phases B–C build the test; only the locked test from C ships.

---

## P — PREREQUISITES: current Next.js with Cache Components

The workflow depends on framework capabilities that ship with current Next.js:

- **Next.js 16+ with `cacheComponents: true`** in `next.config.ts` — without
  Cache Components there is no static shell to optimize.
- **Next.js 16.3+ for Partial Prefetching** — `partialPrefetching`, the
  `prefetch` route segment config, App Shell link behavior, and the dev insight
  used by phase A1 land there. The base static-shell workflow still works on
  earlier Next.js 16 releases.
- **`@next/playwright`** on the same release line as the project's `next` — it
  provides `instant()`. Verify with `npm ls next @next/playwright` (or the
  project's package manager) and align them if they differ. The matching
  testing API is in the `next` runtime, gated by the
  `experimental.exposeTestingApiInProductionBuild` config flag (phase A).

If the project does not meet these, upgrade first (`npx @next/codemod upgrade`
automates most of it), then enable Cache Components in `next.config.ts`:

```ts
export default { cacheComponents: true }
```

This gate is deliberate: the skill targets current Next.js, and none of the
verdicts below are meaningful on older versions.

## 0 — SETUP: discover this project's rig, once per repo

The principles in this skill are fixed; the infrastructure they run on is
yours. On first use in a repository, discover how the project builds, deploys,
authenticates, and tests — inspect the repository first, and ask the user only
what it cannot answer — then write the answers to a committed
`instant-nav.rig.md`. Every later run reads that file instead of
rediscovering. The six questions (BUILD / EXPOSE / RUN / TEST USER / DRIFT /
LOOP), the file template, and filled examples (local-only, generic CI +
container, preview deploy) are in **`rig-template.md`**.

If the repo has no Playwright e2e harness yet, standing up a minimal one
(`@next/playwright`, a config with `baseURL`, one authenticated path) is part
of this step — the loop does not assume a pre-existing suite.

## A — RIG: a production build with the testing API exposed

Stand up the rig described by `instant-nav.rig.md`. Two invariants hold on
every platform:

1. **Never measure on `next dev`.** It does not prefetch, and its lock is
   unreliable for blocking routes — a dev `instant()` result is not a valid RED
   or GREEN.
2. **The measured build must expose the testing API.** Otherwise `instant()`
   silently no-ops and the test passes vacuously (see
   `reference/red-test-robustness.md`). In the structural branch, the target's
   verified phase-C RED proves lock engagement. In the policy-only branch, the
   target stays GREEN, so run an existing known-blocking control test against
   the same artifact; if the rig has none, use a temporary control route that
   renders unlocked and stays absent under `instant()`, then remove it before
   the PR. The positive-plus-negative variant in `test-template.md` strengthens
   this evidence but does not replace the control/differential. Wire
   `experimental.exposeTestingApiInProductionBuild` to a condition that is
   true for every build you measure and never true in production:

   ```ts
   experimental: {
     // Use the condition your platform provides — record it in the rig file:
     //   local:       an explicit opt-in, as below
     //   generic CI:  process.env.DEPLOY_ENV === 'staging'
     //   Vercel:      process.env.VERCEL_ENV === 'preview'
     exposeTestingApiInProductionBuild:
       process.env.EXPOSE_TESTING_API === '1',
   }
   ```

The rig is any production-like build that exposes the testing API — a local
`next build && next start`, a CI/staging container, or a preview deploy are all
first-class; the verdict comes from the build, not the platform. See
`rig-template.md` for filled examples.

For any deployed or remote build, poll the rig's LIVENESS probe to confirm the
artifact contains `HEAD` before trusting a verdict (a stale deploy reads as a
false RED or GREEN); a local `next build && next start` needs none. The probe
mechanism is in `rig-template.md` (question 6).

## A1 — PREFETCH CONTRACT: identify the soft-navigation target

Before phase B for a soft navigation, inspect and record all three inputs in
the test's working notes and PR:

1. the app-level `partialPrefetching` value;
2. the destination page/layout chain's effective `prefetch` export, if any; and
3. the actual inbound `<Link>`'s `prefetch` prop.

Use the matrix in "Know the prefetch contract before testing" to state exactly
what should be available under the lock and choose one marker that belongs to
that UI plus, where possible, one marker that stays deferred. Drive the real
link in the test; two links to the same destination may have different
contracts.

Treat `prefetch = 'force-disabled'` and `<Link prefetch={false}>` as explicit
no-prefetch policy, not Partial Prefetching adoption. A controlled result may
still expose an ancestor or shell, but it cannot establish real delivery for a
link that intentionally skipped it. Record the full segment chain: a deeper
`'force-disabled'` segment is still included when an ancestor's
`'allow-runtime'` response already covers that subtree.

When adopting this target route into Partial Prefetching, do not enable the
global flag first. With the flag off, navigate through each existing inbound
`<Link prefetch={true}>` in `next dev` and use the `link-prefetch-partial`
insight to audit it. Drop `prefetch={true}` when the App Shell is enough; keep
it only when cached page content is worth sending before the click. Opt the
destination in incrementally with `export const prefetch = 'partial'`. This
route-level loop stops there. Enable `partialPrefetching: true` globally and
remove the redundant `'partial'` exports only after the whole app's links and
routes have been audited, following the
[Adopting Partial Prefetching guide](https://nextjs.org/docs/app/guides/adopting-partial-prefetching).
The dev audit establishes the configured policy; the production `instant()`
guard proves the resulting experience. If the task must prove that a browser
actually issued the prefetch, add network/protocol observation separately.

`prefetch = 'allow-runtime'` is a separate, explicit enhancement for selected
full-prefetch links. It does not adopt a route into Partial Prefetching and is
not a substitute for `'partial'`. A segment can export only one policy: keep
`'partial'` during incremental adoption, then enable `partialPrefetching`
app-wide and replace that now-redundant route export with `'allow-runtime'`
only for destinations that justify runtime work.

Adoption does not imply that the route needs a structural refactor. Capture the
pre-adoption contract or dev insight, apply the route/app policy above, then let
phase C classify the work: a missing or useless immediate UI enters the
structural RED loop; an already useful App Shell takes the policy-only GREEN
branch and keeps its structure.

## B — BASELINE (unlocked) — development scaffold, do not ship

Drive the real navigation with no `instant()` lock and assert that the
destination's marker renders **as the test user** — the account the
e2e suite authenticates as (in CI, the CI account; locally, your e2e login
fixture), with its flags, plan, role, and data. This establishes that the
marker is real and reachable: not flag-gated, not redirected away, not a
guessed selector. The suite runs as the test account, not the author's session;
that environment drift (the rig DRIFT list) is a common source of
untrustworthy REDs. Scaffold and run command: **`test-template.md`**.
**Delete this baseline before the PR.**

## C — LOCKED VERDICT: structural RED or policy-only GREEN

Wrap the same navigation in `instant()`; assert the phase-A1 immediate UI
commits under the lock. For Partial Prefetching, also assert that a known
URL-specific or uncached marker stays absent when the contract says it must be
deferred. **This is the test that ships** (`test-template.md`). There are two
valid outcomes:

- **Structural branch — RED.** The expected immediate UI is absent or useless.
  Verify that RED with the C-gate, then continue through D's shell-building
  fixes and the structural differential in F.
- **Policy-only adoption — GREEN.** The App Shell is already useful; only the
  prefetch policy needed to change. Do not manufacture a structural RED or edit
  Suspense boundaries. Keep the GREEN guard, skip D, and use the pre/post
  config, route, Link, and dev-insight evidence from A1/F to prove adoption.

> **C-gate — structural branch only: do not start optimizing until the RED is
> verified trustworthy.** A RED that is red for the wrong reason sends you
> optimizing a route that was never broken. The policy-only branch does not
> need or invent this RED.

The question that settles whether a structural RED is trustworthy: **does
`SHELL_MARKER` render without the lock, as the test user?** Answer it by
re-running phase B as the test user, not by adding assertions to the shipped
test. The resolution (No → marker or environment bug; Yes → genuine structural
gap, proceed to D), the full taxonomy of untrustworthy REDs, the checklist, and
worked cases are in
**`reference/red-test-robustness.md`**. Read it now.

---

## D — FIX (structural branch): push each boundary down to the data it guards

**The anti-pattern: one coarse boundary.** A single `<Suspense>` high in the
tree with a page-level fallback has three costs:

- The layout UI stays out of the static shell — only a throwaway copy of it is
  prerendered.
- The entire subtree is replaced when the boundary resolves, discarding client
  state and shifting layout.
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
is a fallback route, and **all** params defer to request time — including the
enumerated ones. A top-level `await` in a layout (`await params`, a
request-time session read, an auth gate) then blocks the whole subtree out of
the static shell, even when it reads a statically known param. Minimal shape: a
dynamic-segment route with one segment lacking `generateStaticParams`, plus a
top-level `await` in the layout above it.

### The fix: defer the gate, render children

Render `children` unconditionally; move the top-level `await` into a
`<Suspense fallback={null}>`-wrapped child. Mechanism and before→after:
`reference/real-app-patterns.md`, "Deferring an auth gate".

The page that consumes the shell should be sync (no top-level `await`), with
its dynamic data behind `<Suspense>`. `fallback={null}` is correct only when
the gate renders nothing on success. For data, the fallback must be a real
loading skeleton — see D1. The before→after recipe for every other blocker
shape (`cookies()`/`headers()`, uncached fetch or database reads, dynamic
params, `searchParams`, metadata, non-deterministic values like `connection()`,
LCP placement, granularity below shared layouts) is in `reference/patterns.md`.

### D1 — reuse the route's existing loading UI; do not hand-build skeletons

Before writing any skeleton, search the repository for the loading UI that
already exists for this route, in order:

1. the route's `loading.tsx`;
2. an exported `*Skeleton` colocated with the component;
3. the fallback already inside the component's own `<Suspense>`.

The **divergence point** is the lowest layout shared by the source and
destination routes: a soft navigation re-renders only the segments below it,
while an initial load re-runs every layout from the root. (Also called the
shared boundary.) A `loading.tsx` above the divergence point fills only
the initial-load shell — it sits above the soft-nav re-render scope. A
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
example, a flag-gated control), `fallback={null}` is correct — a skeleton
would flash and then collapse.

### D2 — the shell must match the real render at every breakpoint

A skeleton frozen to one breakpoint misaligns on the others. Fix it the same
way: one responsive component renders both the live UI and the shell (D1
skeleton in its data slots), so the breakpoint switch happens once. Verify by
re-asserting the shell marker at two
widths — `await page.setViewportSize({ width: 1280, height: 800 })` then
`{ width: 390, height: 844 }` — or by adding a mobile Playwright project, so
this gate is as machine-checkable as the others. Detail:
`reference/real-app-patterns.md`.

> **D-gate — for the structural branch, phase D is complete when the locked test
> from phase C passes GREEN under the lock on the production-build rig**, not
> when the code compiles. That GREEN is the deterministic stop for the fix loop;
> proceed to E. The policy-only branch skips D because it was already GREEN.

**When the App Shell is useful but a selected link should include more** — opt
the destination into **runtime prefetching** after app-wide Partial Prefetching
is active, and keep `prefetch={true}` on that link. This can add eligible
URL-specific content beyond the App Shell, at the cost of per-link server work.
It does not make `connection()` or fresh uncached data prefetchable, and must
not hide a blank App Shell. Recipe and gotchas: `reference/patterns.md` #10.

## E — PARITY: preserve render behavior and record the policy change

The structural branch's push-down is a mechanical transform, not a redesign;
the policy-only branch has no component refactor. In both, the route must render
the same tree, data, ordering, empty and error states, redirects, and
interactions as before. Adopting Partial Prefetching is a separate, intentional
transport-policy change: request count, prefetched payload, and whether legacy
dynamic data is sent before the click may change exactly as A1 records. Verify:

- **Same render output.** The moved `await`s compute and return the same
  values; after the stream, the route shows the same content as the base
  branch for the test user.
- **Side effects still fire.** A deferred `redirect()` or `notFound()` still
  happens — at request time rather than during prerender. Confirm an
  unauthorized user is still redirected and a missing record still returns 404.
- **Both viewports reach the real UI** after the stream (D2).
- **Client state survives.** Because the layout UI is hoisted into the stable
  shell rather than swapped on resolve, open menus, scroll position, focus,
  and input state persist across the stream.
- **Prefetch behavior matches A1.** A default partially-prefetched link commits
  the App Shell; a deliberate full/runtime-prefetch link includes only the
  additional content approved in A1; `prefetch={false}` is never presented as
  proof of Partial Prefetching delivery.

If rendered behavior changes, or the delivery behavior differs from the A1
contract, reduce or correct the change.

## F — EVIDENCE FOR THE BRANCH YOU TOOK

- **Structural branch:** revert only the shell-building fix → RED; re-apply →
  GREEN; link both runs (`reference/red-test-robustness.md`).
- **Policy-only branch:** record the before/after A1 contract and the relevant
  dev insight/config/route/Link evidence plus the phase-A lock control. The
  `instant()` guard may correctly stay GREEN on both sides. Add network/protocol
  evidence only when actual browser delivery is part of the acceptance
  criteria.

Do not use an `instant()` differential to claim real prefetch delivery: a
`prefetch={false}` Link can stay GREEN under the controlled lock. On a deployed
rig, confirm each measured run is live (LIVENESS, phase A) before trusting it.

## G — REVIEW (PR checklist)

A structural GREEN means nothing if its RED was never trustworthy. A
policy-only GREEN means nothing if the contract change was never established.
Use the applicable robustness checklist (`reference/red-test-robustness.md`),
then require these PR-specific items:

- [ ] **Branch evidence shown** — structural RED/GREEN runs, or policy-only A1
      before/after evidence, is linked.
- [ ] **Parity confirmed (E)** — same content, redirects, and state.
- [ ] **Existing loading UI reused (D1)** — no new page-mirroring skeleton
      (N/A for policy-only).
- [ ] **Shell matches the real render at desktop and mobile widths (D2)**.
- [ ] **Prefetch contract recorded (A1)** — config, route export, real Link
      prop, expected immediate marker, and expected deferred marker (or its
      recorded absence) agree.
- [ ] **Policy and experience are not conflated** — `instant()` guards the
      experience; the dev link/route audit establishes Partial Prefetching
      policy. Claims about actual delivery have separate network evidence.

**Stop condition for the whole workflow:** the locked test from C is GREEN on
the rig, the applicable branch evidence in F holds, and every item above is
checked. A policy-only adoption finishes without a manufactured RED; a
structural change still requires its RED/GREEN differential.

## Driving the navigation in tests

- **Soft navigation** → drive a real `<Link>` click. **Initial load** → use
  `page.goto()` inside `instant()` with the `baseURL` option. Do not substitute
  `goto` for a soft-nav verdict; the two immediate UIs can differ
  (`test-template.md`, `reference/real-app-patterns.md`).
- For a soft navigation, use the exact link inspected in A1. A default link and
  a `prefetch={true}` link to the same URL can expose different immediate UI.
- With parallel routes, only the slots that change re-render on a soft
  navigation; client-rendered navigation UI does not re-render at all. Do not
  chase a slot the navigation never touches
  (`reference/real-app-patterns.md`).

## Files

- `rig-template.md` — phase 0: the six-question rig discovery, the
  `instant-nav.rig.md` template, and filled examples (local-only, generic CI,
  preview deploy).
- `test-template.md` — the shipped `instant()` specs for both navigation
  types (phase C), and the delete-before-PR baseline scaffold (phase B).
- `reference/red-test-robustness.md` — the C-gate and phase F: the taxonomy of
  untrustworthy REDs, the checklist, the differential recipe, the vacuous-pass
  failure mode, and worked cases.
- `reference/patterns.md` — before→after fix recipe for every blocker shape
  (top-level `await` through granularity below shared layouts: also
  `cookies()`/`headers()`, uncached fetch or database reads, dynamic params,
  `searchParams`, metadata, non-deterministic values, LCP placement).
- `reference/real-app-patterns.md` — parallel routes, deferring an auth gate,
  URL-specific static shells vs App Shells vs link-prefetched UI, the
  empty-shell failure mode, the responsive-skeleton mismatch, edge cases.
