---
name: next-cache-components-optimizer
description: >
  Optimize a Next.js Cache Components route so a meaningful static shell
  commits immediately on an initial load, client navigation, or both. Use when
  asked to improve a route's static shell, fix a blocking first paint, or add
  instant() regression coverage. Requires Next.js 16.3+ with Cache Components
  already adopted.
---

# next-cache-components-optimizer

Optimize one target route at a time. Encode the intended shell in a production
[`instant()`](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests)
test, prove the current route fails for the intended reason, apply the public
framework guidance, and keep the passing test as regression coverage.

Before changing the route, read the bundled **Optimizing the static shell**
guide at
`node_modules/next/dist/docs/01-app/02-guides/optimizing-the-static-shell.md`.
If it is unavailable, use the [online
guide](https://nextjs.org/docs/app/guides/optimizing-the-static-shell). The
guide owns Cache Components, Suspense, loading UI, caching, and authorization
patterns and is the source of truth for the framework behavior. Follow its
links to the relevant API references and error pages when choosing and applying
the fix. This skill owns the production test rig, trustworthy RED-to-GREEN loop,
parity check, differential, and reporting.

Use one conclusive run at each gate. Do not stress-run a passing or failing
test, create ad hoc probes, or repeatedly rebuild the same source unless two
results conflict or an infrastructure failure makes the verdict
untrustworthy. A normal run needs one unlocked baseline, one locked RED, one
final GREEN for each contract, the parity check, and one RED/GREEN
differential. Run all in-scope contracts together when the test runner supports
it.

This is not an adoption or Partial Prefetching skill. If Cache Components are
not adopted, use `next-cache-components-adoption` first. If the static shell is
already instant and the user wants URL-specific content ready before a click,
use `next-partial-prefetching-optimizer` instead.

## Goal

Make the target route's most meaningful prerenderable UI commit immediately,
while only genuinely request-time work streams afterward. The locked
`instant()` test proves that a chosen visible marker is present and instant.
It does not prove that the shell is useful, so a blank `fallback={null}` is not
a successful result. The workflow's parity and review gates preserve that
additional product judgment.

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

## Define the contract

Initial loads and client navigations can produce different shells. Follow the
[Instant navigation](https://nextjs.org/docs/app/guides/instant-navigation)
guide to choose which navigation to guard, then identify a meaningful,
visible DOM node in that shell. Guard the navigation the user named. When both
an initial load and client navigation are in scope, give each its own contract
and test. Use `instant()` as a ruler, not a stopwatch: assert what commits while
dynamic data is paused, never elapsed time.

For a client navigation, place the relevant boundary below the layout shared
by the source and destination. When the destination uses parallel routes,
inspect every server-rendered slot that changes; a boundary in one slot does
not cover request-time work in another. A Client Component inside the shared
layout remains mounted during that navigation, so do not treat it as part of
the server-rendered destination tree. Verify it separately on an initial load
when that path is in scope. See [What "instant"
means](https://nextjs.org/docs/app/guides/instant-navigation#what-instant-means)
and [Loading and Error UI with Parallel
Routes](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes#loading-and-error-ui).

Keep one production browser test per route and navigation type. Do not combine
several contracts in one test.

## Workflow

```
- [ ] P  PREREQS      Next.js 16.3+ with Cache Components already adopted
- [ ] 0  SETUP        once per repo: discover + write instant-nav.rig.md     → rig-template.md
- [ ] A  RIG          production build with the testing API exposed          → below
- [ ] B  BASELINE     unlocked: the marker renders for the test user         → test-template.md
- [ ] C  RED          locked instant(): the shell does not commit            → test-template.md
- [ ] C-gate          VERIFY-RED: stop until the RED is trustworthy          → reference/red-test-robustness.md
- [ ] D  FIX          apply the public static-shell patterns to reach GREEN
- [ ]      apply and verify one visible region at a time
- [ ]      reuse existing loading UI; do not hand-build page skeletons
- [ ]      match the completed render at every supported breakpoint
- [ ] E  PARITY       the refactor changed only whether the route is instant
- [ ] F  DIFFERENTIAL revert only the fix → RED; re-apply → GREEN            → reference/red-test-robustness.md
- [ ] G  REVIEW       PR checklist (below)
```

Phases B and C build the test; only the locked test from C ships.

---

## Reuse the production rig

### P. Prerequisites

Confirm the app uses Next.js 16.3 or newer with `cacheComponents: true` and
already builds successfully. If not, stop and use
`next-cache-components-adoption` first.

Install `@next/playwright` on the same release line as `next`. The measured
production build must enable
`experimental.exposeTestingApiInProductionBuild` only in its test environment,
as described in phase A.

### 0. Set up the project's rig

The principles in this skill are fixed; the infrastructure they run on is
yours. On first use in a repository, discover how the project builds, deploys,
authenticates, and tests (inspect the repository first, and ask the user only
what it cannot answer), then write the answers to a committed
`instant-nav.rig.md`. Every later run reads that file instead of
rediscovering. The required build, test context, navigation contracts,
iteration loop, and file template are in **`rig-template.md`**.

If the repo has no Playwright e2e harness yet, standing up a minimal one
(`@next/playwright`, a config with `baseURL`, one authenticated path) is part
of this step; the loop does not assume a pre-existing suite.

### A. Run a production build with the testing API exposed

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
`rig-template.md` for the setup requirements.

For any deployed or remote build, poll the rig's LIVENESS probe to confirm the
artifact contains `HEAD` before trusting a verdict (a stale deploy reads as a
false RED or GREEN); a local `next build && next start` needs none. The probe
mechanism is in `rig-template.md`.

## Prove the current behavior

### B. Prove the target renders without the lock

Drive the real navigation with no `instant()` lock and assert that the
destination's `SHELL_MARKER` renders **as the test user**: the account the
e2e suite authenticates as (in CI, the CI account; locally, your e2e login
fixture), with its flags, plan, role, and data. This establishes that the
marker is real and reachable: not flag-gated, not redirected away, not a
guessed selector. The suite runs as the test account, not the author's session;
that environment drift (the rig DRIFT list) is a common source of
untrustworthy REDs. Scaffold and run command: **`test-template.md`**.
**Delete this baseline before the PR.**

### C. Record a trustworthy RED

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

## Make the smallest optimization

### D. Apply the documented static-shell pattern

Use the **Optimizing the static shell** guide you read at the start. Follow the
section that matches the route's blocker:

- [Keep static UI in the
  shell](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#keep-static-ui-in-the-shell)
- [Cache reusable
  work](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#cache-reusable-work)
- [Resolve data in the Server Component that uses
  it](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#resolve-data-in-the-server-component-that-uses-it)
  for top-level `await`, `params`, `searchParams`, `cookies()`, `headers()`, and
  uncached reads
- [Pass promises to Client
  Components](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#pass-promises-to-client-components)
  when an interactive subtree needs server data
- [Keep streamed work
  parallel](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#keep-streamed-work-parallel)
  when independent work became sequential

For dynamic params that can be enumerated, follow [ISR with Cache
Components](https://nextjs.org/docs/app/guides/incremental-static-regeneration-cache-components).
Use [Follow validation as you
refactor](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#follow-validation-as-you-refactor),
then open any canonical Insight link printed by the build for the specific API
involved. Do not recreate those framework recipes in this Skill.

Metadata and viewport resolve outside the page's component tree, so page-level
boundaries do not cover them. When validation identifies one of these APIs,
follow its specific Insight: [request data in
`generateMetadata()`](https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime),
[uncached data in
`generateMetadata()`](https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic),
[request data in
`generateViewport()`](https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime),
or [uncached data in
`generateViewport()`](https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic).

For synchronous non-deterministic values such as `Date.now()`, `Math.random()`,
or `crypto.randomUUID()`, follow [Random values and
timestamps](https://nextjs.org/docs/app/getting-started/caching#random-values-and-timestamps).
When production output does not identify the source, use the
[`next build` debugging
options](https://nextjs.org/docs/app/guides/building#debugging-build-errors)
to get source-mapped errors or scope the build to the target route. Do not
deploy a build produced with `--debug-prerender`.

Preserve the route's existing freshness and authorization behavior. For a
top-level session gate, follow [Move authentication behind
Suspense](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#step-2-move-authentication-behind-suspense).
Do not replace a mutable or reloadable data source with a build-time import to
make it appear static. Cache the existing read when it can be reused, or stream
it when it must stay request-time.
Reuse the route's loading UI, keep the shell meaningful, and verify every
render path and breakpoint in scope. If the guide does not cover the blocker,
stop and report the missing case instead of inventing a new general pattern
here.

Before creating a fallback, read [Design loading
states](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#design-loading-states),
then inspect the target route for existing loading UI:

1. Use its `loading.tsx` when the whole segment shares one loading state.
2. Reuse an exported `*Skeleton` colocated with the deferred component.
3. Reuse the fallback from an existing `<Suspense>` boundary.

If none applies, extract loading markup next to the component it represents.
Do not create a second skeleton that mirrors the whole page and can drift from
the completed layout.

For a client-navigation contract, make sure the reused `loading.tsx` or
boundary is below the layout shared by the source and destination. A boundary
above that layout can cover an initial load without participating in the client
navigation.

Do not use `export const instant = false` as the optimization. It allows the
segment to block and only opts it out of validation. Do not move `<Suspense>`
above the document `<body>` to make the test green either; an empty document
shell is not meaningful instant UI. See [Opting
out](https://nextjs.org/docs/app/guides/instant-navigation#opting-out) for the
behavior of both escape hatches.

Apply focused changes one region at a time, then run the scoped production
build and locked contracts once the implementation is coherent. Re-run after
a code change or an infrastructure failure, not merely to accumulate passing
runs. Phase D is complete only when the phase-C test passes on the production
rig. A successful build by itself is not GREEN.

If the route already has a meaningful static shell and only URL-specific
content is missing before a client navigation, stop at [Include URL-specific
content in the instant
UI](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#include-url-specific-content-in-the-instant-ui).
That is a Partial Prefetching optimization, not a static-shell change.

If the optimization adds or expands a cache boundary, follow
[Revalidating](https://nextjs.org/docs/app/getting-started/revalidating).
A passing `instant()` test proves shell readiness, not mutation freshness.

### E. Confirm parity

The push-down is a mechanical transform, not a redesign. Afterward the route
must render the same tree, data, ordering, empty and error states, redirects,
and interactions as before; the only observable difference is that the shell
now commits instantly. Verify:

- **Same render output.** The moved `await`s compute and return the same
  values; after the stream, the route shows the same content as the base
  branch for the test user.
- **Side effects still fire.** A deferred `redirect()` or `notFound()` still
  happens, at request time rather than during prerender. Confirm an
  unauthorized user is still redirected and a missing record still renders
  the expected not-found UI. If the route must preserve a specific HTTP status,
  verify it against [streaming status-code
  behavior](https://nextjs.org/docs/app/guides/streaming#status-codes).
- **All supported viewports reach the real UI** after the stream.
- **Client state survives.** Because the layout UI is hoisted into the stable
  shell rather than swapped on resolve, open menus, scroll position, focus,
  and input state persist across the stream. See
  [Preserving UI state](https://nextjs.org/docs/app/guides/preserving-ui-state)
  for the navigation and Activity-specific behavior.
- **Pre-existing failures stay separate.** If the route errors after the
  change, reproduce it on the base branch. The same failure there is an
  environment or data problem, not an optimizer regression.

If anything other than whether the route is instant changed, reduce the refactor.

## Verify and ship

### F. Prove the differential

Revert only the fix → RED; re-apply → GREEN; link both runs
(`reference/red-test-robustness.md`). On a deployed rig, confirm each run is live
(LIVENESS, phase A) before trusting its color.

## Completion checklist

A green final state means nothing if the RED was never trustworthy. The
test-trustworthiness items are the robustness checklist
(`reference/red-test-robustness.md`); confirm them, then require these
PR-specific items:

- [ ] **Differential shown**: RED without the fix, GREEN with it, runs linked.
- [ ] **Parity confirmed (E)**: same content, redirects, and state.
- [ ] **Mutations verified when applicable**: after populating any cache whose
      data can be updated, a mutation test confirms the next read returns the
      expected data.
- [ ] **Freshness preserved**: new cache scopes follow the data's existing or
      explicitly chosen lifetime.
- [ ] **Existing loading UI reused**: no new page-mirroring skeleton.
- [ ] **Shell matches the real render at supported desktop and mobile widths**.
- [ ] **Baseline removed**: only the locked test from C remains.

**Stop condition for the whole workflow:** the locked test from C is GREEN on
the rig, the differential (F) holds, and every item above is checked. Until all
three hold, you are not done.

## Handoff

After the target route is verified, inspect whether the next requested work
belongs to another stage of the same workflow. Determine adoption from
`cacheComponents`, `partialPrefetching`, and route-level `prefetch` config, not
from Link props or observed browser-cache behavior.

- If Cache Components are not adopted, hand off to
  `next-cache-components-adoption`, then return to the target route.
- If the original request also asks for URL-specific UI to be ready before a
  click, check that Partial Prefetching is adopted and continue with
  `next-partial-prefetching-optimizer`. If it is not adopted, use
  `next-partial-prefetching-adoption` first.
- If the original request ends with the static shell, report Partial
  Prefetching as an available next step without expanding the task.

Continue automatically when the next stage is already in scope. Do not pause
for a routine check-in or leave a running build or test for the user to
monitor. Do not add `prefetch={true}` or move URL-specific content into a
prefetch as part of this skill; those decisions belong to the Partial
Prefetching optimizer.

## Files

- `rig-template.md`: phase 0 production build, test context, navigation
  contract, and unattended loop discovery.
- `test-template.md`: the shipped `instant()` specs for both navigation
  types (phase C), and the delete-before-PR baseline scaffold (phase B).
- `reference/red-test-robustness.md`: the C-gate and phase F. The taxonomy of
  untrustworthy REDs, the checklist, the differential recipe, the vacuous-pass
  failure mode, and worked cases.

## Further reading

- [Optimizing the static shell](https://nextjs.org/docs/app/guides/optimizing-the-static-shell)
- [Instant navigation](https://nextjs.org/docs/app/guides/instant-navigation)
- [Caching](https://nextjs.org/docs/app/getting-started/caching)
