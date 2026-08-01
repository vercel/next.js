# Trustworthy RED and differential

The optimizer is allowed to change code only after the RED proves a genuine
prefetch gap for one exact link. A failing target assertion is not enough.

## The C-gate

Require this sequence on the same production artifact and as the same test
user:

1. **Unlocked:** click the exact source link; exact pathname/query, shell, and
   expected URL-derived target content all render.
2. **Locked diagnostic:** click the same link; destination URL changes,
   `SHELL_MARKER` is visible, and `TARGET_MARKER` has count zero.
3. **After release:** `TARGET_MARKER` becomes visible.

Only then restore the positive target assertion and begin phase D.

## What each signal rules out

- **Destination URL wait** rules out matching the source page or clicking a
  nested element that never navigates. Match relevant search params too, not
  only `pathname`.
- **Shell visible under lock** proves Cache Components/Partial Prefetching
  already provide the reusable floor and the route is not wholly blocking.
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
clicking. Do not warm outside the scope or add a sleep. For viewport policy,
do not hover: the test should prove the link's declared eager strategy.

## Common false REDs

- The target is URL-specific but the test user's record/query returns empty.
- The target is behind a flag, role, plan, locale, or experiment absent in CI.
- Auth redirects to a page where the shell selector happens to exist.
- A shared selector matches the source before the destination commits.
- The test clicks a default link while the code change modified a different
  link to the same URL.
- Session-only UI was assumed to need a full prefetch without proving the
  default/full exact-link differential.
- The pathname matches but the query or parameter-derived content is wrong.
- The production build does not have the testing API exposed.
- A remote test ran against a stale deployment.

## Lock engagement

`experimental.exposeTestingApiInProductionBuild` must be true on the measured
artifact. The self-validating diagnostic (target absent under lock, then
visible after release) is the in-band proof that the lock engaged. A vacuous
no-op cannot satisfy both halves.

Never enable this flag for real production traffic. For a remote rig, verify
the deployed commit before trusting RED or GREEN.

## Current API boundary

See: [`instant()`](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests).

Today the public helper is effectively:

```ts
instant(page, callback, { baseURL? })
```

It does not accept a requested stage such as `shell` or `max`, and a failed
test does not produce a framework stack locating the data read where the
prefetch stopped. The exact-link comparison is the supported control:

- default Partial Prefetching link -> App Shell;
- `prefetch={true}` or an eager subtree -> concrete whole-route prefetch may
  commit.

When GREEN does not advance, inspect params/searchParams usage, Suspense, cache
directives, and the Runtime Prefetching guide. Do not compensate with timing.

## Differential

After GREEN:

1. Record the build/commit under test.
2. Remove only the full-prefetch trigger and cache boundary introduced for the
   target.
3. Rebuild and rerun: shell must stay GREEN; target must be RED.
4. Reapply, rebuild, and rerun: both must be GREEN.
5. Confirm the unlocked loaded page is identical in both versions.

If removing the optimization also removes the shell, the change mixed Cache
Components work into this loop. Split it. If the target remains GREEN, it was
already in the shell or another policy still controls the clicked link; the
test does not guard the intended optimization.
