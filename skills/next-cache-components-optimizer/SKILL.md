---
name: next-cache-components-optimizer
description: >
  Optimize a Next.js Cache Components route so a meaningful static shell
  commits immediately on an initial load, then verify any relevant client
  navigation entry points. Use when asked to improve a route's static shell,
  fix a blocking first paint, or add instant() regression coverage. Requires
  Next.js 16.3+ with Cache Components already adopted.
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
guide is the source of truth for Cache Components, Suspense, loading UI,
caching, authorization, and the framework behavior behind each pattern.

The guide owns implementation patterns. This skill owns the navigation
contract, production rig, trustworthy RED-to-GREEN loop, parity check,
differential, and report.

This is not an adoption or Partial Prefetching skill. If Cache Components are
not adopted, use `next-cache-components-adoption` first. If the static shell is
already instant and the user wants URL-specific content ready before a click,
use `next-partial-prefetching-optimizer` instead.

Run the workflow unattended. Stop for user input only when a product decision
cannot be inferred safely without changing freshness, authorization, or
user-visible behavior.

## What stays fixed

The verification loop is the invariant. Use `instant()` as a ruler, not a
stopwatch. Under its lock, request-time work is paused while the intended shell
must still commit. RED proves the gap, GREEN proves it closed, and the final
test prevents the same regression.

The rig is project-specific. Reuse the repository's build, authentication,
data, and Playwright setup. A local production build or a preview deployment
can both work. The verdict must come from a production build with the testing
API exposed, never from `next dev` or elapsed time.

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

Start with an initial page load because it directly captures the target route's
static shell. Add a separate client-navigation contract when the user names
that navigation or when a shared layout gives it a different entry point. The
[Instant navigation](https://nextjs.org/docs/app/guides/instant-navigation)
guide explains why the two entry points can have different instant UI.

For each contract, identify:

- the meaningful visible UI that must be present under the lock;
- the existing loading states that must be visible under the lock;
- the request-time UI that must be absent under the lock and render after it
  releases;
- the pathname, query, authentication, session, parameter, and viewport
  variants that must keep working.

Record the exact existing markers for that contract before editing production
code. Preserve those markers and the completed DOM contract through the
refactor. Do not rename or remove an existing test ID, substitute a looser
selector, or change production markup merely to make the test easier to write.

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
- [ ] 0  SETUP        reuse or document the production instant-nav rig
- [ ] A  RIG          production build with the testing API exposed
- [ ] B  BASELINE     unlocked: every contract eventually renders
- [ ] C  RED          locked: the complete intended shell contract fails
- [ ] C-gate          verify RED is caused by the missing optimization
- [ ] D  FIX          apply the matching documented pattern
- [ ] E  GREEN        every locked contract passes; completed UI still renders
- [ ] F  PARITY       data, variants, errors, redirects, and interactions match
- [ ] G  DIFFERENTIAL remove only the fix -> all contracts RED; restore -> GREEN
```

Only the locked tests ship. The unlocked baseline is temporary.

---

## Reuse the production rig

Confirm the app uses Next.js 16.3 or newer with `cacheComponents: true`. If it
does not, stop and use `next-cache-components-adoption` first.

Read an existing `instant-nav.rig.md`. Cache Components optimization, Partial
Prefetching adoption, and both optimizers share the same build, auth, data, and
Playwright contract. Treat its server lifecycle and commands as fixed. Do not
start a second server when the rig already uses Playwright `webServer` or an
equivalent lifecycle.

If the project has no rig, use [`rig-template.md`](rig-template.md) to discover
and record one. Install `@next/playwright` on the same release line as `next`.
The measured build must enable
`experimental.exposeTestingApiInProductionBuild` only in its test environment.

Run the test against a production build or preview. Development can help
diagnose the route, but it is not a valid RED or GREEN. For a remote build, use
the rig's liveness probe to confirm it contains the current commit before
trusting the result.

## Prove the current behavior

First run an unlocked scaffold that reaches the exact destination and proves
all completed-route variants render for the test user. This catches redirects,
missing data, stale builds, and guessed selectors. Do not ship the scaffold.

Then run the same navigation inside `instant()`. Assert the complete contract:

- every selected shell marker is visible;
- every selected loading state is visible;
- every request-time marker is absent;
- after the lock releases, request-time content renders and the loading states
  disappear.

Read [`reference/red-test-robustness.md`](reference/red-test-robustness.md)
before treating the failure as RED. A timeout before the URL changes, a missing
shell, a redirect, missing test data, a stale preview, or an unengaged lock is a
rig failure rather than proof that the route needs optimization.

Do not weaken positive, fallback, or deferred-content assertions to make the
test pass. If the complete desired contract already passes, stop. Never add
`prefetch={false}` merely to manufacture a RED.

A required contract may not be changed to `skip`, `fixme`, or a soft assertion.
If it behaves unexpectedly, diagnose the production build, testing API,
server lifecycle, URL, and lock before changing the test. Do not label a
failure as a framework limitation merely because a narrower contract passes.
If the required contract cannot be made trustworthy, report the blocker rather
than shipping or claiming GREEN.

Only test files and configuration needed to expose the testing API may change
before the baseline and RED are complete.

---

## Make the smallest optimization

### D. Apply the documented static-shell pattern

Use the **Optimizing the static shell** guide you read at the start. Follow the
anchor that matches the blocker:

| Decision                                                       | Guide pattern                                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Stable UI is hidden by a broader loading state                 | [Keep static UI in the shell](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#keep-static-ui-in-the-shell) |
| A layout or page awaits request-time data too high in the tree | [Push data access down](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#push-data-access-down)             |
| New or moved boundaries need useful, stable fallbacks          | [Design loading states](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#design-loading-states)             |
| A result can be safely reused across requests                  | [Cache reusable work](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#cache-reusable-work)                 |

The guide's example applies the same patterns to common blockers:

- [`params`, `searchParams`, and focused boundaries](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#step-1-move-url-dependent-work-behind-suspense)
- [authentication, `cookies()`, and `headers()`](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#step-2-move-authentication-behind-suspense)
- [cache placement and revalidation](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#step-3-cache-the-reusable-plan-data)
- [the production `instant()` contract](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#step-4-verify-the-instant-ui)

Preserve the route's existing data source, freshness, and authorization
behavior. Do not replace a mutable read with a build-time import to make it
appear static. Cache the existing read when it can be reused. Stream it when it
must stay request-time. Keep the underlying read mechanism and inputs intact
unless the user explicitly asked to change the data layer.

Reuse existing loading UI. Do not create a second page-shaped skeleton. Keep
the shell meaningful at every supported breakpoint. An empty fallback is valid
only when the resolved component also has no visual footprint.

If `next dev` or a build surfaces another instant-navigation insight during the
refactor, use [Follow validation as you
refactor](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#follow-validation-as-you-refactor),
then open the canonical Insight it provides. For metadata, viewport, random
values, and other API-specific blockers, follow that canonical page instead of
inventing another recipe in this skill.

If the optimization adds or expands a cache boundary, follow
[Revalidating](https://nextjs.org/docs/app/getting-started/revalidating). When a
writer can change the cached data, populate the cache, perform the mutation,
and verify the next read returns the updated value. `instant()` proves shell
readiness, not mutation freshness.

Do not use `export const instant = false` or an empty document shell as the
optimization. Apply focused changes until every locked contract is GREEN on
the production rig. A successful build alone is not GREEN.

If URL-specific content is the only missing instant UI, stop at [Include
URL-specific content in the instant
UI](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#include-url-specific-content-in-the-instant-ui)
and hand off to `next-partial-prefetching-optimizer`.

### E. Confirm parity

The push-down is a mechanical transform, not a redesign. Afterward the route
must render the same tree, data, ordering, empty and error states, redirects,
and interactions as before; the only observable difference is that the shell
now commits instantly. Verify:

- **Same render output.** The moved `await`s compute and return the same
  values; after the stream, the route shows the same content as the base
  branch for the test user.
- **Request inputs still work.** Exercise any relevant authentication,
  session, cookie, parameter, or search-parameter variants named by the route
  or rig. Checking only the default completed content is not parity.
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
(`reference/red-test-robustness.md`). Every contract intended to distinguish
the optimization must be RED after the revert and GREEN after the re-apply. A
partial RED does not complete the differential. On a deployed rig, confirm each
run is live (LIVENESS, phase A) before trusting its color.

Run the rig's complete in-scope command after the final re-apply. A filtered
test, a passing subset, a written note, or a suite with a required test skipped
does not establish GREEN or parity. The command must exit successfully with
every required contract executed.

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
