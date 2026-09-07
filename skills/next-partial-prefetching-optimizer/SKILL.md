---
name: next-partial-prefetching-optimizer
description: >
  Optimize what one Next.js client navigation includes before the click under
  Partial Prefetching. Use after Cache Components and Partial Prefetching are
  adopted when the user wants selected URL-specific UI to be instant, wants
  reusable content to wait for navigation, or needs to choose between default,
  viewport, and intent prefetching. Requires Next.js 16.3+.
---

# Partial Prefetching optimizer

Optimize one exact source link and destination at a time. Agree on the UI that
is valuable before the click, the UI that should wait for navigation, and the
acceptable prefetch cost. Encode that contract in a production
[`instant()`](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests)
test, work it from RED to GREEN, and keep the positive test as regression
coverage.

Before making framework changes, read the bundled Optimizing prefetching guide
at
`node_modules/next/dist/docs/01-app/02-guides/optimizing-prefetching.md`. If the
bundled guide is unavailable, use the [online
guide](https://nextjs.org/docs/app/guides/optimizing-prefetching). It is the
source of truth for App Shell behavior, `prefetch={true}`, cache and session
patterns, and cost trade-offs. Do not copy those recipes into the skill or
improvise alternatives from this file.

This is not an adoption skill. Do not enable Cache Components or Partial
Prefetching, run their migrations, or redesign the route's App Shell as a side
effect. If the App Shell itself cannot commit under `instant()`, stop and use
`next-cache-components-optimizer` first.

## Define the contract

Inspect the source route, the exact link or interaction, the destination's
Suspense boundaries, its data reads, existing prefetch policy, and any existing
`instant()` test. Then confirm with the user:

- which destination UI should be ready before the click;
- which reusable UI should wait for navigation;
- whether full prefetching should start in the viewport or only after intent.

The trigger is part of the behavior. Two links to the same URL may have
different prefetch policies and need separate tests.

Use the guide's cost model. A bounded set of high-intent links may justify
`prefetch={true}` in the viewport. Large lists and grids should normally keep
the default App Shell prefetch and upgrade only the hovered or focused link.
Leave must-be-fresh data streaming.

## Reuse the production rig

Read an existing `instant-nav.rig.md`. Cache Components optimization and
Partial Prefetching adoption use the same build, auth, data, and Playwright
contract. Extend it with the exact source link, destination markers, and
prefetch budget instead of creating a second rig.

If the project has no rig, use
[`next-cache-components-optimizer/rig-template.md`](../next-cache-components-optimizer/rig-template.md)
to discover and record one. The measured run must be a production build or
preview where `experimental.exposeTestingApiInProductionBuild` is enabled only
for testing. Development can help diagnose a route, but automatic link
prefetching is production-only.

## Prove the current behavior

Search for an existing `instant()` test for the exact source link and
destination. Strengthen it when it already owns the same behavior; otherwise
add a focused click-driven test.

First run an unlocked scaffold that proves the link reaches the exact pathname
and query and that all selected UI eventually renders for the test user. Do not
ship this scaffold.

Then run the same interaction inside `instant()`:

- the existing App Shell must remain visible;
- the selected prefetch target should be absent before the optimization;
- content chosen for the navigation stage should also be absent;
- after the lock releases, every selected region must eventually render.

Read [`reference/red-test-robustness.md`](reference/red-test-robustness.md)
before treating this failure as RED. A timeout before the URL changes, a
missing App Shell, a redirect, missing data, or a stale preview is a broken rig
or a different problem, not permission to change prefetching.

If the complete desired contract already passes under the lock, stop. Never
add `prefetch={false}` merely to manufacture a RED.

## Make the smallest optimization

Follow the Optimizing prefetching guide for cache placement, freshness,
session data, Suspense, and link policy. Change only what the selected contract
requires.

Current Next.js can also place reusable work at explicit runtime stages:

- `await unstable_prefetch()` keeps following content out of the App Shell but
  allows an explicit full prefetch to include it.
- `await unstable_navigation()` keeps following content out of runtime
  prefetches so it renders after the click.

These APIs are not documented publicly yet. Until they are, keep the stage
boundary in an uncached Server Component below Suspense and call cached work
after the boundary. Do not call either API inside `"use cache"`,
`"use cache: private"`, `unstable_cache()`, `after()`, or
`generateStaticParams()`.

```tsx
import {
  unstable_navigation as navigation,
  unstable_prefetch as prefetch,
} from 'next/cache'

async function PrefetchedDetails({ id }: { id: string }) {
  await prefetch()
  return <CachedDetails id={id} />
}

async function NavigationOnlyRelated({ id }: { id: string }) {
  await navigation()
  return <CachedRelated id={id} />
}
```

`prefetch()` is useful only when the exact link opts into full prefetching.
`navigation()` is useful when reusable content should remain absent even from
that full prefetch. Neither replaces a cache lifetime.

Work one accepted navigation to GREEN before moving to another. Do not create
an app-wide Link or cache abstraction from a single case.

## Verify and ship

The positive locked test should drive the real source link and assert:

```text
App Shell visible
and selected prefetched UI visible
and navigation-only UI absent
```

After the lock releases, assert that the deferred regions render. Preserve the
loaded page's content, ordering, empty and error states, authorization,
freshness, redirects, and direct-load behavior.

Finally, remove only the optimization and rerun the test:

- the App Shell stays GREEN;
- the selected prefetch contract returns RED.

Reapply the optimization and require GREEN again. This differential proves the
test guards the exact link policy instead of unrelated cached state. Ship only
the final positive test.

Report the result per navigation: source link, destination, what is in the App
Shell, what extra UI is eligible before the click, what waits for navigation,
and whether the trigger is viewport or intent. Be precise that prefetching is
best-effort; the App Shell remains the fallback when it has not completed.

## Completion checklist

- [ ] Cache Components and Partial Prefetching were already adopted.
- [ ] The user selected the target UI and accepted the trigger cost.
- [ ] The test clicks the exact source link and verifies the exact destination.
- [ ] The unlocked baseline and locked RED used the same production artifact.
- [ ] The App Shell stayed visible throughout the RED/GREEN loop.
- [ ] The selected UI is present and navigation-only UI is absent under lock.
- [ ] Loaded content, freshness, authorization, and direct visits are unchanged.
- [ ] Removing only the optimization returns the contract to RED.
- [ ] The final positive `instant()` regression test ships.

## Files

- `test-template.md`: exact-link unlocked and locked test shapes.
- `reference/red-test-robustness.md`: trustworthy RED and differential checks.

## Further reading

- [Optimizing prefetching](https://nextjs.org/docs/app/guides/optimizing-prefetching)
- [Instant navigation](https://nextjs.org/docs/app/guides/instant-navigation)
- [Prefetching](https://nextjs.org/docs/app/guides/prefetching)
