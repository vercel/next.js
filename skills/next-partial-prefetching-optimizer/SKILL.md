---
name: next-partial-prefetching-optimizer
description: >
  Optimize what a specific Next.js client navigation includes in its
  prefetched result under Partial Prefetching. Inspect the app and agree on the
  desired prefetched UI, navigation-only UI, and cost posture, then encode that
  exact client navigation as a failing @next/playwright instant() e2e, work it to green with
  targeted prefetch stages and caching, and ship the test as a regression
  guard. Use after Cache Components and Partial Prefetching adoption when asked
  to prefetch URL-specific params/searchParams content or a proven
  session-backed exact-link target, make more than the App Shell instant, tune
  prefetch={true}, choose viewport versus intent prefetch, or optimize Partial
  Prefetching without increasing every link's server cost.
  Requires Next.js 16.3+, cacheComponents, and Partial Prefetching.
---

# next-partial-prefetching-optimizer

Set up an agentic optimization loop that makes selected UI eligible for an
exact client navigation's prefetched result and leaves other UI for the
navigation. The loop is test-driven: encode one exact source-link/destination pair as a failing
`@next/playwright` `instant()` test, work it to green, and ship the test as the
regression guard. Run the phases P -> G in order; each ends in a gate.

This is an **optimizer**, not an adoption skill. Partial Prefetching must
already be adopted. Before the unattended loop starts, inspect the app and ask
the user which content should be prefetched, which should wait for navigation,
and how much prefetch traffic is acceptable. Then optimize the agreed
navigations without stopping after each one.

Optimization decisions and links live in
`reference/patterns.md`. Test-trustworthiness rules live in
`reference/red-test-robustness.md`. Read each only when its phase points there.

## Ownership boundary

`next-cache-components-adoption` enables the prerequisite. The Cache
Components optimizer owns the shared static shell, while Partial Prefetching
adoption owns the legacy link audit, preservation baseline, and app-wide
migration. Either optimizer can run before the other, but this skill requires
both adoptions to be complete. It consumes an accepted exact-link goal—often a
`TODO(per-link-prefetch)` left by either earlier skill—and owns that
navigation's `instant()` RED-to-GREEN loop.

Keep this skill inside that boundary:

- Do **not** enable `cacheComponents` or `partialPrefetching`.
- Do **not** run the adoption audit, codemod, or development insight sweep.
- Do **not** grow or redesign the App Shell. If it is missing, hand off to the
  Cache Components optimizer and stop this loop.
- Do **not** optimize initial document loads; a per-link policy cannot change
  them.
- Prefer session-only content in the per-session App Shell. Consider it here
  only when the exact-link differential proves a full prefetch adds UI and the
  user accepts that link's cost. Leave must-be-fresh content streaming.
- Do **not** add full prefetching to every link as a generic performance fix.
- Do **not** add `prefetch={false}`. A link this optimizer changes ends with
  automatic prefetching (no prop) or `prefetch={true}`.

This skill may reuse the shell test produced by the Cache Components optimizer
and extend it with selected prefetch and navigation-only assertions. It must
not weaken, replace, or silently reinterpret that test.

## What is invariant, and what is yours

- **Invariant: the verification loop.** The proof is a real `<Link>`
  navigation under `instant()`: the destination App Shell commits and the
  selected prefetch target also commits, while navigation-only content does
  not. RED shows that the selected contract is not met; GREEN shows the chosen
  stages and caching produce it. The test ships.
- **The mechanism: `@next/playwright` [`instant()`](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests).**
  The helper gates dynamic
  writes and reenacts the prefetch strategy of the link being clicked. A
  default Partial Prefetching link is restricted to its reusable App Shell; a
  `<Link prefetch={true}>` navigation may use the concrete, whole-route
  prefetch. This is a ruler, not a stopwatch.
- **Yours: the product goal and budget.** The framework cannot decide whether
  a card grid, search result, or detail heading is valuable enough to prefetch,
  nor whether viewport-triggered server work is affordable. Establish that
  once before the loop.
- **Yours: the rig.** Build, deploy, auth, Playwright, and CI belong to the
  project. Phase 0 maps the invariant onto that infrastructure.

## One link, one prefetched result

The same route can be reached through links with different policies. Under the
testing lock, a default link stays restricted to the App Shell even if some
other `prefetch={true}` link already warmed the concrete URL. Therefore every
case is identified by all three of these:

1. source URL;
2. exact link/interaction (viewport or intent-triggered);
3. destination URL and target marker.

Do not write a generic route test when the product behavior differs by entry
point. Two navigations to the same destination may need two tests.

## Client navigation only

Per-link policy changes a real [`<Link>`](https://nextjs.org/docs/app/api-reference/components/link#prefetch)
navigation, not the initial document response. A direct `page.goto()` may stay
as a parity check, but it is not RED or GREEN for this loop. Do not substitute
it for the exact click or attribute one link's result to the route as a whole.

## Strengthen the existing test first

Search for an existing `instant()` test for the source/destination navigation
before creating a new file. Prefer this progression:

1. Keep its shell marker and exact navigation.
2. Add an unlocked scaffold proving the chosen target and deferred content
   eventually render.
3. Add `TARGET_MARKER` and, when applicable, `NAVIGATION_MARKER` to the locked
   test, producing RED for the selected contract.
4. Work only those assertions to GREEN.
5. Delete the unlocked scaffold and ship the strengthened locked test.

Create a new test only when the existing test guards a different source link,
navigation type, auth state, or destination behavior. A Cache optimizer test
that uses `page.goto()` cannot become this optimizer's verdict by adding a
target assertion; add a separate click-driven test.

## Goal

Start from the App Shell as the reliable instant floor, then prefetch one
meaningful selected region while keeping explicitly deferred work out. GREEN
means:

`SHELL_MARKER visible` **and** `TARGET_MARKER visible` **and**
`NAVIGATION_MARKER absent` under the lock.

The primary target depends on the destination URL (`params`, `searchParams`, or
the full URL) and is backed by work with a valid cache lifetime. Prefer cookies
and headers in the per-session App Shell, but do not treat that as a framework
prohibition: a proven exact-link case may include session-backed UI too.
Must-be-fresh uncached UI cannot be pulled into the prefetch and continues to
stream.

The locked GREEN proves **prefetch eligibility and committed UI after the
selected strategy completes**. It does not prove every production prefetch
finishes before a fast click. Runtime prefetching is best-effort; the App Shell
stays the deterministic fallback.

## Reporting to the user

This loop is meant to run unattended after the initial goal/budget decision.

- **Speak their language.** Distinguish what is now prefetch-eligible, what was
  observed ready in the production demonstration, and what still streams. Do
  not imply that a best-effort prefetch finishes before every click.
- **Show, don't tell.** Drive the final client navigation in a production run
  so the user sees the selected UI already rendered when the URL changes. Use
  before/after screenshots only when a live browser is unavailable.
- **Present one line per exact navigation,** not a phase transcript. Report the
  trigger policy and cost posture: viewport prefetch for N visible links,
  intent prefetch, or no optimization.
- **Give the user a click-through table:** source URL/link, destination URL,
  what the App Shell shows, what extra UI is prefetch-eligible, what was
  observed ready in the production demonstration, what still streams, and
  whether the trigger is viewport or intent. This is their manual verification
  checklist for the production run.
- **Surface only genuine forks:** unclear freshness, security-sensitive data,
  or a cost/product decision the code cannot answer. Ask those in one batch;
  after the user answers, keep the loop moving.

## The workflow

```text
- [ ] P  PREREQS      Next 16.3+, Cache Components + Partial Prefetching adopted
- [ ] 0  SCOPE        inspect app shape; agree target UI and prefetch budget
- [ ] A  RIG          production build with testing API exposed      -> rig-template.md
- [ ] B  BASELINE     unlocked: shell + target render for test user  -> test-template.md
- [ ] C  RED          locked result differs from selected contract   -> test-template.md
- [ ] C-gate          verify exact link, target, and lock             -> reference/red-test-robustness.md
- [ ] D  FIX          assign content to stages + choose trigger       -> reference/patterns.md
- [ ]      D1 keep App Shell as the fallback; do not weaken shell behavior
- [ ]      D2 keep prefetch cost proportional to likely navigations
- [ ] E  PARITY       loaded UI/freshness/auth behavior is unchanged
- [ ] F  DIFFERENTIAL remove optimization -> contract RED; reapply -> GREEN
- [ ] G  REVIEW       checklist below
```

Phases B and C author the test; only the positive locked test ships.

---

## P. PREREQUISITES: adoption comes first

Require all of the following:

- Next.js 16.3+ with `cacheComponents: true`.
- Partial Prefetching enabled globally with `partialPrefetching: true`, or the
  destination opted in with `export const prefetch = 'partial'`.
- The Partial Prefetching adoption sweep is complete for the target route.
- `@next/playwright` and `@playwright/test`, with `@next/playwright` on the
  same release line as `next`.

If Partial Prefetching is not adopted, stop and use
[`next-partial-prefetching-adoption`](https://github.com/vercel/next.js/tree/canary/skills/next-partial-prefetching-adoption).
If the App Shell itself cannot commit under `instant()`, stop and use
[`next-cache-components-optimizer`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-optimizer).

Do not turn on either feature as a side effect of this optimizer. Their
adoption changes the app-wide prefetch model and belongs in a separate change.

## 0. SCOPE: inspect, then ask once

Read the route tree, source links, destination components, data access, current
`prefetch` props/wrappers, Playwright suite, and any existing
`instant-nav.rig.md`. Classify candidate regions before asking the user:

| App/content shape                                             | Optimizer decision                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Mostly static; little URL-dependent UI                        | Keep the App Shell default; no per-link optimization                             |
| Cached params/searchParams content with clear pre-click value | Good candidate                                                                   |
| Session/user content without URL dependency                   | Prefer the per-session App Shell; consider only after an exact-link differential |
| Must-be-fresh uncached content                                | Leave it streaming; full prefetch cannot advance past it                         |
| A few high-intent navigation links                            | Viewport `prefetch={true}` may be worth the cost                                 |
| Large/high-cardinality lists, feeds, or grids                 | Prefer intent-triggered full prefetch, or keep shell-only                        |
| Rarely used links                                             | Skip; paying before click is unlikely to help                                    |

If adoption left `TODO(per-link-prefetch)` markers, they're a good place to start
when the user hasn't named a link:

```bash
rg -n -A2 "TODO\(per-link-prefetch\)" --glob 'app/**' --glob 'src/app/**'
```

Each hit is additional UI outside the legacy contract that adoption left
undecided. There may be none, which is fine. The user's chosen navigation is
the scope either way.

Produce a short inspection record before the question:

- **Navigation inventory:** source route, exact link component, destination,
  visible-link count, and whether the link appears in viewport or after user
  intent.
- **Rendered stages:** nodes already in the shared App Shell, URL-specific
  Suspense regions, and must-be-fresh regions that always stream.
- **Data classification:** static, URL (`params`/`searchParams`/full URL),
  session (`cookies`/`headers`), or uncached request-time work.
- **Existing policy:** default, `prefetch={true}`, `prefetch={false}`, custom
  wrapper, imperative prefetch, or a `TODO(per-link-prefetch)` left by adoption.
- **Candidate proof:** one stable shell marker and one real URL-specific target
  marker for the test user. For a session-backed exception, record why it is
  absent from the default shell and present under the full-link strategy.

Do not infer the product goal from a `prefetch={true}` already in the code. It
may be migration residue that adoption preserved. Treat it as evidence of the
current behavior, then ask whether that behavior is still wanted.

Then ask one batched product question: **which URL-specific regions, or proven
session-backed exact-link regions, should be selected for prefetch, and should
each full prefetch begin in the viewport or only after intent?** Explain the
inferred cost in concrete terms (for example, "24
visible product links can cause 24 server renders"), and recommend a posture
from the table. Do not ask the user to choose framework internals.

Record each accepted case in the rig as:

```text
source -> trigger -> destination | SHELL_MARKER | TARGET_MARKER | NAVIGATION_MARKER | viewport/intent
```

Once the list is agreed, run it unattended. If no candidate pays for itself,
report that the App Shell is already the correct optimum and stop without code
changes.

## A. RIG: production prefetch behavior with the API exposed

Read an existing `instant-nav.rig.md` first. The Cache Components optimizer
and test-backed Partial Prefetching adoption use the same project-local build,
auth, and testing contract, so extend that file with this optimizer's target
and budget fields instead of creating another rig. If no rig exists because
the earlier work used a manual path or no prior skill ran, discover and create
the same file from `rig-template.md`; this optimizer does not require running a
previous skill. The rig must provide:

1. a production build (`next build` + `next start`, staging, or preview),
   because automatic prefetching is production-only;
2. `experimental.exposeTestingApiInProductionBuild` enabled only on measured
   builds;
3. matching auth, data, flags, locale, and URL for the test user;
4. a repeatable build -> run -> e2e loop, with deployment liveness when remote.

`instant()` itself is also available in development, but a dev run cannot
prove a production prefetch optimization. Use dev only to investigate.

Current API limit: `instant(page, fn, { baseURL? })` has no option to request a
named prefetch stage such as `shell` or `max`, and a failed assertion does not
print a framework blocker stack. This skill compares the actual clicked link's
default/full strategy instead. Inspect the route and the relevant docs when a
target does not advance; do not invent an `instant()` option or a timing wait.

### What the lock proves

For each locked client navigation, Next.js starts a clean prefetch and waits
for the requests that prefetch spawns. Reads are limited to entries owned by
that capture. With Partial Prefetching and no whole-route request, concrete
params are restricted to the fallback shell. With the clicked link's full
strategy, the matching concrete entry may commit.

This gives the loop a deterministic comparison, but only of committed UI. It
does not prove that production users always finish a best-effort prefetch before
click, measure network latency, or estimate server cost. Keep those as product
and traffic judgments; do not turn the e2e into a stopwatch.

## B. BASELINE (unlocked): prove the selected markers are real

Drive the exact source link without `instant()` and establish all of these:

- the trigger exists for the test user;
- the URL reaches the intended destination (no redirect or intercepted-route
  mismatch);
- `SHELL_MARKER` renders;
- `TARGET_MARKER` eventually renders with representative data;
- any `NAVIGATION_MARKER` eventually renders after the navigation.

The target marker must be the real selected region, not its fallback or an
ancestor already in the App Shell. For a session-backed exception, assert the
specific content the full-link differential adds. Use stable `data-testid`s
where needed. Delete this unlocked scaffold before the PR.

If the target is a list, assert a stable container or seeded record that
represents useful content, not `.first()` on an environment-dependent query.
If it can validly be empty, seed the test user or choose a marker that exists in
both non-empty and empty resolved states but never in the fallback.

Template: `test-template.md`.

## C. RED (locked) + VERIFY-RED

Wrap the same link interaction in `instant()`. The desired positive test
asserts the shell and target are visible and any navigation-only marker is
absent. Before optimization, at least one of those contract assertions must
fail while `SHELL_MARKER` remains visible. After the lock releases, every real
page marker must eventually render.

This RED proves both prerequisites at once:

- shell absent -> this is a Cache Components/static-shell problem; hand off;
- shell present and target absent -> content can move into the full prefetch;
- shell and unwanted content present -> content can wait for navigation;
- every selected assertion already passes -> this navigation is already
  optimized; do not change it.

Make this comparison against the exact link's existing policy. Do not set
`prefetch={false}` to manufacture a RED.

> **C-gate:** do not optimize until the unlocked baseline passes and the locked
> run proves the selected stage contract fails for the exact link. Read
> `reference/red-test-robustness.md` now.

The expected phase-C failure is narrow: destination URL reached, shell visible,
and only a selected stage assertion failed. A timeout before the URL changes,
absent shell, redirect, auth failure, or missing test data is a broken test/rig
or another skill's problem. Fix or hand it off; do not start changing prefetch
policy.

## D. FIX: assign the selected UI to the right stages

Read `reference/patterns.md`, then apply the smallest complete
change:

1. Keep the route's URL read below its existing `<Suspense>` boundary.
2. Give the work behind it a cache lifetime only when its freshness permits.
   Pass params/searchParams values into a cached function; do not read runtime
   APIs inside a plain `use cache` scope. Runtime-prefetched cache entries need
   a `stale` time of at least 30 seconds on current Next.js; verify that rule
   against the installed version's bundled
   [`use cache: private` docs](https://nextjs.org/docs/app/api-reference/directives/use-cache-private).
3. When the selected contract needs an explicit stage, check that the installed
   version documents [`unstable_prefetch()`](https://nextjs.org/docs/app/api-reference/functions/unstable_prefetch)
   or [`unstable_navigation()`](https://nextjs.org/docs/app/api-reference/functions/unstable_navigation),
   then follow that API reference. If the matching reference is unavailable,
   do not introduce the API or infer its behavior from this skill.
4. For a small set of high-intent links, use
   [`prefetch={true}` behavior](https://nextjs.org/docs/app/api-reference/components/link#prefetch).
5. For many visible links, keep the default shell prefetch and upgrade only the
   hovered/focused link using
   [hover-triggered prefetch](https://nextjs.org/docs/app/guides/prefetching#hover-triggered-prefetch)
   as the base pattern.
6. Remove that link's `TODO(per-link-prefetch)` marker, and its `// See:` line,
   once the locked test is GREEN. That marker is the only record the work is
   outstanding, so it stays until then.
7. Re-run the locked test after every coherent edit until the prefetched
   markers are GREEN and navigation-only markers stay absent. No sleeps,
   manual warming, or custom time threshold.

Work one accepted navigation at a time. After each GREEN, immediately run its
differential and parity checks before moving to the next case. Share cache or
Link abstractions only after two real cases demonstrate the same policy; do not
create an app-wide wrapper from the first link and accidentally widen the cost
surface.

If a full prefetch still stops at the same fallback, inspect the first
URL-dependent subtree that did not commit. The common outcomes are:

- eligible work lacks a cache lifetime -> follow the
  [Optimizing prefetching cache patterns](https://nextjs.org/docs/app/guides/optimizing-prefetching);
- the clicked link never switched to full prefetch -> fix that exact wrapper;
- content is uncached by design -> stop and leave it streaming;
- content is session-only -> prefer the shell workflow; keep it here only when
  the exact-link differential and user-approved cost justify the exception.

### D1: preserve the App Shell floor

The optimization layers URL-specific content on top of the shared App Shell.
Do not move existing shell UI below Suspense, disable the route's partial
prefetch, or trade a reliable fallback for a best-effort full prefetch. On a
slow connection or early click, users still fall back to the App Shell.

### D2: keep cost proportional to intent

Count the relevant links as rendered, not only the component definitions. A
single card component can create hundreds of runtime prefetches. Viewport full
prefetch is suitable when link count is bounded and click-through is high.
Intent-triggered full prefetch is the default for unbounded lists and grids.
Skip the optimization if the target cannot finish before likely clicks or does
not reveal meaningfully more UI.

> **D-gate:** phase D is complete only when the locked test from C passes on
> the production rig and the trigger policy matches the agreed cost posture.

## E. PARITY: only readiness changed

After the stream completes, compare with the baseline:

- same content, ordering, empty/error states, redirects, and interactions;
- same auth and authorization behavior;
- same freshness and invalidation semantics promised before the cache change;
- same App Shell when the full prefetch is unavailable or incomplete;
- direct visits preserve the route's existing document-shell and streaming
  behavior.

If caching changed data correctness or access scope, remove it and choose a
safer target. Readiness is the only intended observable difference.

Also verify the cost policy as behavior, not prose. On the production run,
inspect network activity while the relevant links enter the viewport and while
one link receives hover/focus. A bounded viewport policy should request only
the bounded set. An intent policy should not launch one full render for every
visible card at once, but every distinct hovered/focused link can still incur
the cost over a session. Touch users normally fall back to the App Shell unless
the product deliberately defines another trigger. Do not assert exact request
timing or internal RSC URLs in the shipped regression test; this is a review
check for the chosen trigger.

## F. DIFFERENTIAL

Remove only the per-link optimization (the stage boundary, `prefetch={true}`
upgrade, and where necessary its cache boundary) and rerun the locked test:

- `SHELL_MARKER` stays GREEN;
- at least one selected target/navigation-only assertion returns RED.

Reapply the optimization and require both GREEN. This is stronger than a
generic before/after: it proves Partial Prefetching still supplies the common
floor while this exact link supplies the selected upgrade. For a remote rig,
confirm deployment liveness before each verdict. The link-policy differential
is automatic prefetching (no prop) versus `prefetch={true}`; never add
`prefetch={false}` as a test control.

## G. REVIEW

- [ ] Prerequisites were adopted separately; the App Shell passes under lock.
- [ ] User selected the target UI and accepted viewport/intent cost posture.
- [ ] Test drives the exact source link and waits for the destination URL.
- [ ] Existing shell `instant()` test was strengthened where it represented
      the same navigation; otherwise a separate click-driven test was added.
- [ ] `SHELL_MARKER`, `TARGET_MARKER`, and any `NAVIGATION_MARKER` passed the C-gate.
- [ ] The full prefetch contains exactly the selected UI stages.
- [ ] High-cardinality links use intent prefetch or stay shell-only.
- [ ] Cache lifetime, auth scope, and invalidation preserve behavior.
- [ ] Exact pathname/query and exact selected target content are asserted.
- [ ] Differential holds: remove fix -> shell GREEN/contract RED; reapply -> contract GREEN.
- [ ] Only the positive locked regression test ships.

**Stop condition:** every accepted navigation is GREEN on the production rig,
its differential holds, parity is confirmed, and the checklist is complete.

## Files

- `rig-template.md`: shared production-build and test-user contract, plus the
  per-navigation target/budget fields this optimizer adds.
- `test-template.md`: unlocked baseline, locked RED/GREEN, viewport and intent
  interactions, and optional initial-load contrast.
- `reference/patterns.md`: target selection, viewport/intent link patterns,
  URL-data caching, and cases to skip.
- `reference/red-test-robustness.md`: exact-link and stage-contract C-gate,
  differential, and current `instant()` API limits.

## Further reading

- [Optimizing prefetching](https://nextjs.org/docs/app/guides/optimizing-prefetching)
- [Prefetching](https://nextjs.org/docs/app/guides/prefetching)
- [`Link` `prefetch`](https://nextjs.org/docs/app/api-reference/components/link#prefetch)
