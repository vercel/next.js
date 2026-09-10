# Trustworthy RED and differential

Change the implementation only after the RED proves a genuine prefetch-contract
gap for one exact link. A failing assertion alone is not enough.

## Verification gate

Require this sequence on the same production artifact and as the same test
user:

1. **Unlocked:** click the exact source link; exact pathname/query, shell, and
   expected URL-derived target content all render.
2. **Locked diagnostic:** click the same link; destination URL changes,
   `SHELL_MARKER` is visible, and the current result differs from the selected
   target/navigation-only contract.
3. **After release:** every marker selected from the loaded page is visible.

Only then restore the selected contract assertions and change the
implementation.

## What each signal rules out

- **Destination URL wait** rules out matching the source page or clicking a
  nested element that never navigates. Match relevant search params too, not
  only `pathname`.
- **Shell visible under lock** proves the route already has an App Shell and is
  not wholly blocking.
- **Target visible unlocked** rules out auth, flags, empty data, typoed
  selectors, and redirects hiding the region.
- **Target absent locked, visible after release** proves it is outside the
  prefetched result rather than absent altogether.

## The trigger is part of the test

Do not replace the real link with `router.push`, `page.goto`, or another link
to the same URL. The testing lock reenacts the clicked link's fetch strategy.
It intentionally restricts a default Partial Prefetching link to the App Shell
even if a sibling `prefetch={true}` link already warmed a concrete-param cache
entry.

For an intent policy, hover or focus the exact link inside `instant()` before
clicking. Click without a fixed delay and assert the prefetched UI after the
destination URL changes. Do not warm outside the scope or inspect private
request headers to decide when the prefetch is ready. For viewport policy, do
not hover: the test should prove the link's declared eager strategy.

Reusing a browser worker does not require aggregating several contracts into
one test. Separate tests prevent navigation cache and interaction state from
leaking between routes, and their failures identify the exact contract that
regressed.

## Common false REDs

- The target is URL-specific but the test user's record/query returns empty.
- The target is behind a flag, role, plan, locale, or experiment absent in CI.
- Auth redirects to a page where the shell selector happens to exist.
- A shared selector matches the source before the destination commits.
- The test clicks a default link while the code change modified a different
  link to the same URL.
- Session-only UI was assumed to need a per-link prefetch without proving the
  default/per-link exact-link differential.
- The pathname matches but the query or parameter-derived content is wrong.
- The production build does not have the testing API exposed.
- A remote test ran against a stale deployment.
- A local start failed with `EADDRINUSE` and the test hit the previous build.

## Contract already GREEN

Run the locked diagnostic against the exact link as it exists. If the shell and
target are visible, navigation-only markers are absent, and the lock is
engaged, the current link already meets the contract. It is not an optimizer
candidate, even if setting `prefetch={false}` would make it RED. Never add that
prop as a test control; the optimizer compares automatic prefetching with no
prop against `prefetch={true}`.

## Lock engagement

`experimental.exposeTestingApiInProductionBuild` must be true on the measured
artifact. A marker that is absent under lock and visible after release is the
in-band proof that the lock engaged. A vacuous no-op cannot satisfy both
halves.

Never enable this flag for real production traffic. For a remote rig, verify
the deployed commit before trusting RED or GREEN.

## What `instant()` can verify

See: [`instant()`](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests).

The public helper accepts a page, callback, and optional `baseURL`:

```ts
instant(page, callback, { baseURL? })
```

It does not accept a requested stage such as `shell` or `max`. A failed test
also does not identify the data read where the prefetch stopped. Compare the
same exact link before and after the optimization:

- existing exact-link policy -> current committed UI;
- accepted policy change -> the selected prefetch stages may commit.

If the optimization does not change the locked result, inspect `params`,
`searchParams`, Suspense boundaries, and cache directives using the
[Optimizing prefetching guide](https://nextjs.org/docs/app/guides/optimizing-prefetching).
Do not compensate with timing.

`instant()` does not expose a public request classifier for App Shell,
per-link, and navigation requests. Internal request headers and segment URLs
can change between Next.js versions, so do not use them as product regression
assertions. Use `instant()` for the visible contract and record network or
platform cost data separately when the task calls for it.

## Differential

After the test passes:

1. Record the build/commit under test.
2. Remove only the stage, per-link prefetch trigger, and cache boundary
   introduced for the contract.
3. Rebuild and rerun. The shell should stay available, but the selected
   prefetch contract should fail.
4. Reapply the optimization, rebuild, and rerun. The complete contract should
   pass again.
5. Confirm the unlocked loaded page is identical in both versions.

If removing the optimization also removes the shell, the change mixed Cache
Components work into this loop. Split it. If the contract remains GREEN,
another policy still controls the clicked link or the changed boundary does
not own the asserted content; the test does not guard the intended
optimization. Do not replace the unchanged automatic policy with
`prefetch={false}` to force this step RED.
