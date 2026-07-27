# Test template: the instant() guard

Ship one test per navigation type you are guarding: under `instant()`, assert that the
destination's static shell appears. `instant()` gates dynamic data, so a correctly instant route
commits its shell under the lock and a blocking route does not. `instant()` is a ruler, not a
stopwatch: do not add custom timeouts or timing races (see `reference/red-test-robustness.md`).
Whether the marker is the right one (rendering for the test user, not flag-gated, not redirected
away, not guessed) is established at authoring time with the unlocked baseline scaffold below
(phase B, the C-gate), not by additional assertions in the shipped test.

All identifiers in angle brackets (`<b>`, `<Trigger>`) and the `../helpers` import are placeholders;
substitute your project's e2e auth helper, URL helper, and real testids/trigger before running.

## Soft navigation (client-side navigation)

Drive a real `<Link>` click. The committed shell is the destination's prefetched App Shell.
Under the lock the router initiates and awaits the route prefetch itself, so no manual warming is
needed; if the shell is intermittently absent, treat it as a real blocker or marker bug (C-gate),
never as a warming race. Do not add waits or hovers.

```ts
import { test, expect } from '@playwright/test'
import { instant } from '@next/playwright'
// Use the auth/setup helpers your e2e suite already has. Run as the test user
// (defined in SKILL.md phase B).
import { logIntoTestAccount, testUrl } from '../helpers'

// A SYNC element of the destination's static shell (header, action button,
// column header), not data that streams in, and one that renders for the
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
      // static shell asserted under the lock; no timeout
      await expect(page.locator(SHELL_MARKER)).toBeVisible()
    })
  })
})
```

The trigger selector follows the same rule as `SHELL_MARKER`: prefer a `data-testid` on the real
`<Link>` (`page.getByTestId('<trigger>-link')`) over a guessed accessible name. `getByRole({ name })`
is shown only for brevity; like the marker, the trigger must reliably resolve for the test user.

## Initial load (hard navigation)

Drive `page.goto()` inside `instant()` with the `baseURL` option. The served document is the
route's prerendered static shell. `baseURL` is required because `page` is still `about:blank` when
`instant()` runs (`resolveURL` falls back to `page.url()` only when no `baseURL` is passed).
Establish the session WITHOUT navigating `page` (inject `storageState`, or log in on a separate
context/page). A login helper that navigates `page` itself defeats the measurement for a different
reason: that navigation completes before `instant()` acquires the lock, so it runs unmeasured. The
session must be pre-established either way; otherwise an authenticated route redirects to login
and the RED is false.

If the project's only login helper navigates `page`, the agent must use a
storageState/separate-context path here instead, a session-injection call that
does NOT call `page.goto`:

```ts
test.describe('instant initial load: B', () => {
  test.beforeEach(async ({ page }) => {
    await injectTestUserSession(page) // storageState only; must NOT call page.goto
  })

  test('B shell is served', async ({ page }) => {
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
})
```

## Self-validating variant (recommended for routes with deferred content)

Also assert that the deferred content is gated under the lock and streams after release. This
makes a vacuous pass impossible: if the lock did not engage (testing API missing from the build),
the content is already present and `toHaveCount(0)` fails (see `reference/red-test-robustness.md`).

`SHELL_MARKER` is the shell node; `[data-testid="<b>-content"]` is the deferred data it guards.

```ts
// soft navigation
await instant(page, async () => {
  await trigger.click()
  await expect(page.locator(SHELL_MARKER)).toBeVisible() // shell present
  await expect(page.getByTestId('<b>-content')).toHaveCount(0) // deferred data gated
})
await expect(page.getByTestId('<b>-content')).toBeVisible() // streams after release
```

The two **gated-half** assertions (shell visible, deferred content `toHaveCount(0)`) apply to the
initial-load `page.goto()` form too. The cookie gates the deferred content identically for both:
on a soft navigation the client lock gates dynamic-data writes; on an initial load the server
honors the cookie on the document request (set via `addCookies()` before navigation, scoped by
`baseURL`) and suspends dynamic data, independent of whether the route was previously rendered or
cached. So the initial-load `toHaveCount(0)` gated half is as valid as the soft-nav one; it needs
no fresh browser context and no cache-busting query param.

The **post-release** assertion (`getByTestId('<b>-content').toBeVisible()` after the `instant()`
block) is soft-nav only. On an initial load the document was already emitted under the lock, so
nothing streams in after release; drop that assertion from the initial-load test, or
`page.reload()` first to fetch an unlocked document. The mechanism is in
`reference/red-test-robustness.md`.

## Baseline scaffold: do not ship

Before optimizing, confirm the target exists with an unlocked check (no `instant()`). It
disambiguates "not instant" from "marker absent for this user or environment". Run it as the test
user; mismatch against the rig DRIFT list is what the C-gate catches
(`reference/red-test-robustness.md`). Confirm the marker is real and reachable, then delete the
scaffold before the PR.

**The baseline must mirror the navigation type of the test you are shipping.** Drive a `<Link>`
click when guarding the soft-nav shell; drive `page.goto()` when guarding the initial-load shell.
The two shells can differ (`reference/real-app-patterns.md`): a click-driven baseline run against a
shipped `goto` test would confirm a marker that the `goto` path never shows, which produces exactly
the false RED the C-gate exists to prevent.

```ts
// soft-nav baseline: mirror the soft-nav instant() test
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

```ts
// initial-load baseline: mirror the initial-load instant() test (session pre-established)
test('dev-only: <b> shell is served (no lock)', async ({ page }) => {
  await page.goto(testUrl('/<b>'))
  await expect(page.locator(SHELL_MARKER)).toBeVisible({ timeout: 15000 })
})
```

Notes:

- Pick `SHELL_MARKER` as a sync element of the destination's static shell, never streamed data.
  Use a `data-testid` on a known static node rather than a guessed role/name.
- Do not put a custom timeout, a `painted` boolean, or `isVisible({ timeout })` in the shipped
  assertion, and do not add retries or hover-warming; see `reference/red-test-robustness.md`.
