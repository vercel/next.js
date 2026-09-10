---
name: next-partial-prefetching-optimizer
description: >
  Optimize what selected Next.js client navigations include before the click
  under Partial Prefetching. Use after Cache Components and Partial Prefetching
  are adopted when the user wants selected URL-specific UI to be instant,
  wants reusable content to wait for navigation, or needs to choose between
  default, viewport, and intent prefetching. Requires Next.js 16.3+.
---

# Partial Prefetching optimizer

Optimize each requested source link and destination as its own contract. Turn
the requested prefetched UI, navigation-only UI, and trigger into a production
[`instant()`](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests)
test. Record the current behavior, make the smallest optimization, verify the
differential, and keep the passing test as regression coverage.

Before making framework changes, read the bundled Optimizing prefetching guide
at
`node_modules/next/dist/docs/01-app/02-guides/optimizing-prefetching.md`. If the
bundled guide is unavailable, use the [online
guide](https://nextjs.org/docs/app/guides/optimizing-prefetching). It is the
source of truth for prefetch stages, `prefetch={true}`, session-specific UI,
and cost trade-offs.

When the work changes what belongs in the App Shell, follow the
[Instant navigation](https://nextjs.org/docs/app/guides/instant-navigation) and
[Caching](https://nextjs.org/docs/app/getting-started/caching) docs for cache
placement, Suspense boundaries, loading UI, and authorization.

The guides own framework behavior and implementation patterns. This skill owns
the navigation contract, production rig, trustworthy RED-to-GREEN loop, parity
check, differential, and report.

This is not an adoption skill. If Cache Components or Partial Prefetching are
not adopted, use their adoption skills and return to this workflow. If the App
Shell itself cannot commit under `instant()`, use
`next-cache-components-optimizer` first, then resume the selected navigation.

Run the workflow unattended. Resolve the contract from the request and the
existing application. Stop for user input only when a product decision is
genuinely blocked and cannot be inferred safely without changing cost,
freshness, authorization, or user-visible behavior.

## Reporting to the user

This loop runs unattended, so do not stop between implementation steps. Finish
the navigations the user named, then check in. The rig, lock, RED/GREEN loop,
and stage names are internal scaffolding; report the product behavior instead.

- **Speak their language.** Describe the source link and result in terms of
  what the user sees before and after the click, not the validation mechanics.
- **Show, don't tell.** Drive the exact link in a production browser so the user
  sees which content is already available and which content streams after the
  click. If a live demonstration is unavailable, attach before/after captures.
- **Give them a concise click-through list, not a technical results table.** Use
  one line per navigation with the source URL, link to click, UI ready before
  the click, UI that waits for navigation, and whether prefetching starts in the
  viewport or after intent.
- **Only surface a question for a genuine fork.** Ask when the choice changes
  cost, freshness, authorization, or visible behavior. If the user already
  requested a PR or named every navigation, finish that scope without asking
  again.

## Define the contract

Inspect the source route, the exact link or interaction, the destination's
Suspense boundaries, its data reads, existing prefetch policy, and any existing
`instant()` test. Record:

- which destination UI should be ready before the click;
- which reusable UI should wait for navigation;
- whether per-link prefetching should start in the viewport or only after
  intent.

The trigger is part of the contract. Two links to the same URL may use
different prefetch policies and need separate tests.

Use the guide's cost model when the trigger is not already specified. Do not
silently increase the number of links that can invoke the server or cache data
whose freshness contract is unknown.

## Reuse the production rig

Read an existing `instant-nav.rig.md`. Cache Components optimization, Partial
Prefetching adoption, and this optimizer share the same build, auth, data, and
Playwright contract. Add the exact source link, destination markers, and
prefetch budget instead of creating another rig.

If the project has no rig, use [`rig-template.md`](rig-template.md) to discover
and record one. The measured run must be a production build or
preview where `experimental.exposeTestingApiInProductionBuild` is enabled only
for testing. Development can help diagnose a route, but automatic link
prefetching is production-only.

## Prove the current behavior

Search for an existing `instant()` test for the exact source link and
destination. Extend it when it already covers the same behavior. Otherwise,
add a focused click-driven test using the guide's
[prefetched and deferred content testing](https://nextjs.org/docs/app/guides/optimizing-prefetching#test-prefetched-and-deferred-content)
pattern.

Keep one production browser test per source-link, destination, and trigger
contract. Do not loop over several destinations or collect their readiness
results in one test. Focused tests can still run serially in one browser worker.

First, run an unlocked scaffold that proves the link reaches the exact pathname
and query and that the selected UI eventually renders for the test user. Do not
ship this scaffold.

Then run the same interaction inside `instant()`. The existing App Shell must
stay visible, while the guide's positive and negative assertions capture the
prefetched result. After the lock releases, every selected region must
eventually render.

Read [`reference/red-test-robustness.md`](reference/red-test-robustness.md)
before treating this failure as RED. A timeout before the URL changes, a
missing App Shell, a redirect, missing data, or a stale preview indicates a rig
or route problem. It does not justify changing prefetching.

If the complete desired contract already passes under the lock, stop. Never
add `prefetch={false}` merely to manufacture a RED.

Only test files and the configuration needed to expose the testing API may
change before these runs finish. Run builds and tests in the foreground. If the
harness moves one into the background, wait for it to exit and continue the
loop in the same task. A written test or a build still in progress is not
verification.

## Make the smallest optimization

Follow the Optimizing prefetching guide for stage and link policy. If the
contract also requires changing cache placement, Suspense, or loading UI,
follow the static-shell documentation used by
`next-cache-components-optimizer`. Preserve the existing freshness and
authorization behavior. Change only what the selected contract requires.

When reusable UI should wait for navigation, follow the
[`unstable_navigation()`](https://nextjs.org/docs/app/api-reference/functions/navigation)
reference, including its comparison with `connection()`. Then verify both
properties independently. The `instant()` assertion proves that the UI is
absent from the prefetch; it does not prove that the underlying work stayed
reusable. Verify that reusable work remains cached below the stage boundary.

When the contract needs an explicit runtime stage, follow the API references
for [`unstable_prefetch()`](https://nextjs.org/docs/app/api-reference/functions/prefetch)
and
[`unstable_navigation()`](https://nextjs.org/docs/app/api-reference/functions/navigation).

Work one accepted navigation to GREEN before moving to another. Do not create
an app-wide Link or cache abstraction from a single case.

If the optimization adds or expands a cache boundary, follow
[Revalidating](https://nextjs.org/docs/app/getting-started/revalidating).
When a writer can change that cached data, test the complete lifecycle: populate
the cache, perform the mutation, then read the data again and verify the updated
value. A passing `instant()` test proves prefetched readiness, not mutation
freshness.

## Verify and ship

Keep the passing locked test for the real source link as regression coverage.
Preserve the loaded page's content, ordering, empty and error states,
authorization, freshness, redirects, and direct-load behavior.

Finally, remove only the optimization and rerun the test:

- the App Shell stays GREEN;
- the selected prefetch contract returns RED.

Reapply the optimization and require GREEN again. This differential proves the
test guards the exact link policy instead of unrelated cached state. Ship only
the final positive test.

Report the verified result using the user-facing format above. Be precise that
prefetching is best-effort; the App Shell remains the fallback when it has not
completed.

Treat request counts, transferred bytes, and cache behavior as measurements,
not as part of the `instant()` contract. Do not classify requests using private
RSC URLs or internal headers such as `next-router-prefetch`. The public testing
API verifies the rendered result, not the protocol stage that produced each
request.

## Completion checklist

- [ ] Cache Components and Partial Prefetching were already adopted.
- [ ] The target UI, trigger, freshness, and authorization constraints were
      resolved from the request and existing application.
- [ ] The test clicks the exact source link and verifies the exact destination.
- [ ] Each source-link, destination, and trigger contract has its own test.
- [ ] The unlocked baseline and locked RED used the same production artifact.
- [ ] The App Shell stayed visible throughout the RED/GREEN loop.
- [ ] The selected UI is present and navigation-only UI is absent under lock.
- [ ] Reusable navigation-only work remains cached below its navigation stage.
- [ ] After populating any new cache whose data can be updated, a mutation test
      confirms the next read returns the expected data.
- [ ] Loaded content, freshness, authorization, and direct visits are unchanged.
- [ ] Removing only the optimization returns the contract to RED.
- [ ] The final positive `instant()` regression test ships.

## Handoff

Finish every navigation named in the request. If Cache Components or Partial
Prefetching are not adopted, use `next-cache-components-adoption` or
`next-partial-prefetching-adoption`, then return to this workflow. If the App
Shell cannot commit under `instant()`, use `next-cache-components-optimizer`
and resume the selected navigation afterward. Do not leave a build or test for
the user to monitor.

Report additional optimization candidates without changing them unless they
are already in scope. Do not broaden a selected per-link policy into an app-wide
Link or cache abstraction.

## Files

- `rig-template.md`: production build, test context, navigation contract, and
  unattended loop discovery for projects without an existing
  `instant-nav.rig.md`.
- `reference/red-test-robustness.md`: trustworthy RED and differential checks.

## Further reading

- [Optimizing prefetching](https://nextjs.org/docs/app/guides/optimizing-prefetching)
- [Instant navigation](https://nextjs.org/docs/app/guides/instant-navigation)
- [Caching](https://nextjs.org/docs/app/getting-started/caching)
- [Prefetching](https://nextjs.org/docs/app/guides/prefetching)
