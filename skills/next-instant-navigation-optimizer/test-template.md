# Test template — the instant() guard

Ship one test per navigation type you are guarding: under `instant()`, assert that the
destination's static shell appears. `instant()` gates dynamic data, so a correctly instant route
commits its shell under the lock and a blocking route does not. `instant()` is not a stopwatch —
the test does not measure or bound how fast anything appears, so there are no custom timeouts and
no timing races (see `reference/red-test-robustness.md`). Whether the marker is the right one —
rendering for the CI test user, not flag-gated, not redirected away, not guessed — is established at
authoring time with the unlocked baseline scaffold below (phase B, gate C), not by additional
assertions in the shipped test.

## Soft navigation (client-side navigation)

Drive a real `<Link>` click. The committed shell is the destination's prefetched static shell.

```ts
import { test, expect } from '@playwright/test'
import { instant } from '@next/playwright'
// Use the auth/setup helpers your e2e suite already has. The test user here
// must be the CI test user — the account the suite runs as in CI.
import { logIntoTestAccount, testUrl } from '../helpers'

// A SYNC element of the destination's static shell (header, action button,
// column header) — not data that streams in, and one that renders for the CI
// test user (not gated by a flag, plan, role, or empty state). Prefer a
// data-testid on a known static node over a guessed role/name.
const SHELL_MARKER = '[data-testid="<b>-shell-marker"]'

test.describe('instant nav: A -> B', () => {
  test.beforeEach(async ({ page, browser }) => {
    await logIntoTestAccount(page, browser)
  })

  test('B shell commits under instant()', async ({ page }) => {
    await page.goto(testUrl('/'))
    const trigger = page.getByRole('link', { name: '<Trigger>', exact: true })
    await expect(trigger).toBeVisible({ timeout: 20000 })

    await instant(page, async () => {
      await trigger.click()
      // Dynamic data is gated under the lock — assert the static shell
      // appears. That is the instant property. No custom timeout: a blocking
      // route's content never commits under the lock, and an instant route's
      // shell is present.
      await expect(page.locator(SHELL_MARKER)).toBeVisible()
    })
  })
})
```

## Initial load (hard navigation)

Drive `page.goto()` inside `instant()` with the `baseURL` option. The served document is the
route's prerendered static shell. This is also where interactivity across hydration can be
asserted — for example, that input typed before hydration completes is preserved.

```ts
test('initial load: B shell is served', async ({ page }) => {
  const url = testUrl('/<b>')
  await instant(
    page,
    async () => {
      await page.goto(url)
      await expect(page.locator(SHELL_MARKER)).toBeVisible()
    },
    { baseURL: new URL(url).origin }
  )
})
```

The two shells can differ for the same route (`reference/real-app-patterns.md`). Guard the case
you are shipping; guard both when both matter.

## Self-validating variant (recommended for routes with deferred content)

Also assert that the deferred content is gated under the lock and streams after release. This
makes a vacuous pass impossible: if the lock did not engage (testing API missing from the build),
the content is already present and `toHaveCount(0)` fails. Only valid on a fresh (uncached)
route — a warmed route serves the content regardless (see `reference/red-test-robustness.md`).

```ts
await instant(page, async () => {
  await trigger.click()
  await expect(page.getByTestId('b-shell')).toBeVisible() // shell present
  await expect(page.getByTestId('b-content')).toHaveCount(0) // deferred data gated
})
await expect(page.getByTestId('b-content')).toBeVisible() // streams after release
```

## Baseline scaffold — do not ship

Before optimizing, confirm the target exists with an unlocked check (no `instant()`). It
disambiguates "not instant" from "marker absent for this user or environment". Run it as the CI
test user — drift between your session and that account (the DRIFT list in the rig file) is where
most untrustworthy REDs come from. Confirm the marker is real and reachable, then delete the
scaffold before the PR:

```ts
test('dev-only: navigating to <b> renders its shell (no lock)', async ({
  page,
}) => {
  await page.goto(testUrl('/'))
  const trigger = page.getByRole('link', { name: '<Trigger>', exact: true })
  await expect(trigger).toBeVisible({ timeout: 20000 })
  await trigger.click()
  await expect(page).toHaveURL(/\/<b>(\?|$)/) // confirm the real destination (no redirect away)
  await expect(page.locator(SHELL_MARKER)).toBeVisible({ timeout: 15000 })
})
```

Notes:

- Pick `SHELL_MARKER` as a sync element of the destination's static shell, never streamed data.
  Use a `data-testid` on a known static node rather than a guessed role/name.
- No timing in the shipped assertion: a plain `await expect(marker).toBeVisible()` under the lock.
  Do not add a custom timeout, a `painted` boolean, or `locator.isVisible({ timeout })` (that
  timeout is deprecated and ignored by Playwright).
- No retries on an `instant()` guard. Under the lock the router initiates and awaits the route
  prefetch itself before committing, so the verdict does not depend on a prior hover or viewport
  prefetch. A flaky guard has a real cause — a marker that is not a sync shell node, a
  flag/role/empty-state gap for the CI user, or a genuinely blocking route. Retries mask the
  regression the guard exists to catch.
- Differential check, captured in the PR: revert only the fix → RED; re-apply → GREEN; nothing
  else moves it. Link both runs (`reference/red-test-robustness.md`).
