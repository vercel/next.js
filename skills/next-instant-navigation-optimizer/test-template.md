# Test template — the instant() guard

Ship one test per navigation type you are guarding: under `instant()`, assert that the expected
immediate UI appears. For an initial load, that is a URL-specific static shell when one exists or
the reusable App Shell fallback for an ungenerated URL. For a soft navigation, it is whatever the
real Link's phase-A1 prefetch contract makes available: the App Shell, cached page content, or
eligible runtime-prefetched content. A route that blocks before the chosen marker cannot commit it
under the lock. `instant()` is a ruler, not a stopwatch — no custom timeouts, no timing races (see
`reference/red-test-robustness.md`). Whether the marker is the right one —
rendering for the test user, belonging to the selected contract, not flag-gated, not redirected
away, not guessed — is established at authoring time with the unlocked baseline scaffold below
(phase B, the C-gate), not by additional timed assertions in the shipped test.

For policy-only Partial Prefetching adoption, this guard may correctly start
GREEN; keep it and use the A1/F before-and-after policy evidence instead of
inventing a structural failure.

All identifiers in angle brackets (`<b>`, `<Trigger>`) and the `../helpers` import are placeholders
— substitute your project's e2e auth helper, URL helper, and real testids/trigger before running.

## Soft navigation (client-side navigation)

Drive the exact real `<Link>` inspected in phase A1. Under Partial Prefetching, a default/auto Link
commits the destination's shared App Shell; `prefetch={true}` can additionally include cached page
content, and a runtime-enabled destination can include eligible URL-specific data. Under the lock
the router initiates and awaits a controlled route prefetch itself, so no manual warming is needed;
if the expected UI is intermittently absent, treat it as a real blocker, contract mismatch, or
marker bug (C-gate), never as a warming race — do not add waits or hovers. An App Shell claim needs
both a positive marker from the shell and, when one exists, a negative marker outside the selected
contract; a positive-only assertion proves only that one node is available. Select the negative
marker from A1: URL-specific content works for a default Partial Prefetching Link, but a generated
static shell or an `allow-runtime` full Link may already include it, so use genuinely uncached
content there. If nothing sits outside the contract, omit `DEFERRED_MARKER` and its two assertions
and record that limitation instead of claiming exclusion.

```ts
import { test, expect } from '@playwright/test'
import { instant } from '@next/playwright'
// Use the auth/setup helpers your e2e suite already has. Run as the test user
// (defined in SKILL.md phase B).
import { logIntoTestAccount, testUrl } from '../helpers'

// A SYNC element of the expected immediate UI (header, action button, column
// header) — not data outside the phase-A1 contract, and one that renders for
// the test user (not gated by a flag, plan, role, or empty state). Prefer a
// data-testid on a known node over a guessed role/name.
const SHELL_MARKER = '[data-testid="<b>-shell-marker"]'
const DEFERRED_MARKER = '[data-testid="<b>-outside-contract"]'

test.describe('instant nav: A -> B', () => {
  test.beforeEach(async ({ page, browser }) => {
    await logIntoTestAccount(page, browser)
  })

  test('B immediate UI commits under instant()', async ({ page }) => {
    await page.goto(testUrl('/'))
    const trigger = page.getByRole('link', { name: '<Trigger>', exact: true })
    await expect(trigger).toBeVisible({ timeout: 20000 })

    await instant(page, async () => {
      await trigger.click()
      // expected immediate UI asserted under the lock — no timeout
      await expect(page.locator(SHELL_MARKER)).toBeVisible()
      // required for an App Shell claim when outside-contract content exists
      await expect(page.locator(DEFERRED_MARKER)).toHaveCount(0)
    })
    await expect(page.locator(DEFERRED_MARKER)).toBeVisible()
  })
})
```

The trigger selector follows the same rule as `SHELL_MARKER`: prefer a `data-testid` on the real
`<Link>` (`page.getByTestId('<trigger>-link')`) over a guessed accessible name. `getByRole({ name })`
is shown only for brevity; like the marker, the trigger must reliably resolve for the test user.

This test proves the UI that can commit under the controlled lock. It does not prove the Link
prefetched before a real click: `instant()` schedules its controlled navigation prefetch even for
`prefetch={false}`. For a Partial Prefetching adoption task, require a destination adopted via
`partialPrefetching: true` or `prefetch = 'partial'`, and a real Link that is not
`prefetch={false}`. The dev link/route audit establishes that policy; use network/protocol
observation separately if actual delivery itself is an acceptance criterion.

## Initial load (hard navigation)

Drive `page.goto()` inside `instant()` with the `baseURL` option. The served document starts with a
URL-specific static shell when one exists, otherwise the App Shell fallback. `baseURL` is required
because `page` is still `about:blank` when `instant()` runs (`resolveURL` falls back to `page.url()`
only when no `baseURL` is passed) —
establish the session WITHOUT navigating `page` (inject `storageState`, or log in on a separate
context/page). A login helper that navigates `page` itself defeats the measurement for a different
reason: that navigation completes before `instant()` acquires the lock, so it runs unmeasured. The
session must be pre-established either way — otherwise an authenticated route redirects to login
and the RED is false.

If the project's only login helper navigates `page`, the agent must use a
storageState/separate-context path here instead — a session-injection call that
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
        await expect(page.locator(DEFERRED_MARKER)).toHaveCount(0)
      },
      { baseURL: new URL(url).origin }
    )
    await expect(page.locator(DEFERRED_MARKER)).toBeVisible()
  })
})
```

## Positive-plus-negative discrimination

Also assert that content outside the selected contract is absent under the lock and appears after
release. Both templates above include this pair when the selected contract has deferred content.
It is stronger than a positive-only assertion, but it does not independently prove that the lock
engaged: an ordinary Partial Prefetching navigation may commit the App Shell while URL data is
still in flight. The exposed testing API plus either the structural RED/GREEN differential or the
policy-only branch's known-blocking control provide the proof (see
`reference/red-test-robustness.md`).

`SHELL_MARKER` is the immediate node; `DEFERRED_MARKER` is data that the phase-A1 contract says
stays deferred. For a default Link under Partial Prefetching, a non-root `params`, `searchParams`,
or full-URL-dependent node is a strong choice. For a generated URL's concrete static shell or an
`allow-runtime` full Link, choose genuinely uncached content instead. Do not assume all dynamic
content is absent: cookies/headers may be in a session-specific App Shell, and a
`prefetch={true}`/runtime-prefetched Link may legitimately include additional data.

The same three assertions apply to the initial-load `page.goto()` form. The cookie gates the
deferred content identically for both: on a soft navigation the client lock gates dynamic-data
writes; on an initial load the server honors the cookie on the document request (set via
`addCookies()` before navigation, scoped by `baseURL`) and suspends dynamic data — independent of
whether the route was previously rendered or cached. So the initial-load `toHaveCount(0)` gated
half is as valid as the soft-nav one; it needs no fresh browser context and no cache-busting
query param. The mechanism is in `reference/red-test-robustness.md`.

## Baseline scaffold — do not ship

Before optimizing, confirm the target exists with an unlocked check (no `instant()`). It
disambiguates "not instant" from "marker absent for this user or environment". Run it as the test
user; mismatch against the rig DRIFT list is what the C-gate catches
(`reference/red-test-robustness.md`). Confirm the marker is real and reachable, then delete the
scaffold before the PR.

**The baseline must mirror the navigation type of the test you are shipping.** Drive a `<Link>`
click when guarding the soft-nav immediate UI; drive `page.goto()` when guarding the initial-load
shell. The two immediate UIs can differ (`reference/real-app-patterns.md`): a click-driven baseline
run against a shipped `goto` test would confirm a marker that the `goto` path never shows,
producing exactly the false RED the C-gate exists to prevent.

```ts
// soft-nav baseline — mirror the soft-nav instant() test
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
// initial-load baseline — mirror the initial-load instant() test (session pre-established)
test('dev-only: <b> shell is served (no lock)', async ({ page }) => {
  await page.goto(testUrl('/<b>'))
  await expect(page.locator(SHELL_MARKER)).toBeVisible({ timeout: 15000 })
})
```

Notes:

- Pick `SHELL_MARKER` as a sync element of the destination's selected immediate contract, never
  data that should stream afterward. Use a `data-testid` on a known node rather than a guessed
  role/name.
- For an App Shell guard, use a default/auto Link to a destination adopted into Partial
  Prefetching, and pair the positive marker with a URL-specific negative marker.
- No custom timeout, `painted` boolean, or `isVisible({ timeout })` in the shipped assertion; no
  retries or hover-warming — see `reference/red-test-robustness.md`.
