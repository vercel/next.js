# Test template: exact-link prefetched UI

See: [`@next/playwright` `instant()`](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests).

This file adds exact-link Partial Prefetching assertions.

Ship one positive locked test per source-link/destination behavior you guard.
The same route can have a default link and a `prefetch={true}` link with
different instant UI, so the trigger is part of the test identity.

Replace every angle-bracket placeholder and helper import with the project's
real route, auth setup, and stable test IDs.

## Unlocked baseline: do not ship

This proves the exact link reaches the intended URL and both markers exist for
the test user. It does not prove either marker was prefetched.

```ts
import { test, expect } from '@playwright/test'
import { instant } from '@next/playwright'
import { logIntoTestAccount, testUrl } from '../helpers'

const SHELL_MARKER = '[data-testid="<destination>-shell"]'
const TARGET_MARKER = '[data-testid="<destination>-url-content"]'
const EXPECTED_TARGET_TEXT = '<exact expected content for this destination>'
const EXPECTED_PATHNAME = '/<destination>'

function normalizeQuery(searchParams: URLSearchParams) {
  const normalized = new URLSearchParams(searchParams)
  normalized.sort()
  return normalized.toString()
}

const EXPECTED_QUERY = normalizeQuery(
  new URLSearchParams([['<query-key>', '<query-value>']])
)

function isExpectedDestination(url: URL) {
  return (
    url.pathname === EXPECTED_PATHNAME &&
    normalizeQuery(url.searchParams) === EXPECTED_QUERY
  )
}

test.beforeEach(async ({ page, browser }) => {
  await logIntoTestAccount(page, browser)
})

test('dev-only: target eventually renders from the exact link', async ({
  page,
}) => {
  await page.goto(testUrl('/<source>'))
  const trigger = page.getByTestId('<exact-trigger>-link')
  await expect(trigger).toBeVisible({ timeout: 20000 })

  // Add trigger.hover() here if this case intentionally prefetches on intent.
  await trigger.click()
  await page.waitForURL(isExpectedDestination)
  await expect(page.locator(SHELL_MARKER)).toBeVisible({ timeout: 15000 })
  await expect(page.locator(TARGET_MARKER)).toBeVisible({ timeout: 15000 })
  await expect(page.locator(TARGET_MARKER)).toHaveText(EXPECTED_TARGET_TEXT)
})
```

Use an empty array for a destination with no query. Sorting and comparing the
complete query ignores parameter order but fails for extra or duplicate
parameters. Keep `toHaveText` when the selected content has an exact stable
value; use an equally exact semantic assertion for structured content rather
than weakening it to a substring.

Run it unlocked, verify representative content, then delete it before the PR.

## Locked RED/GREEN: ship this

Before optimization, the shell assertion passes and the target assertion is
RED. After optimization, both are GREEN. Waiting for the URL before asserting
prevents a selector shared with the source page from passing early.

```ts
test('prefetches <target> for <source> -> <destination>', async ({ page }) => {
  await page.goto(testUrl('/<source>'))
  const trigger = page.getByTestId('<exact-trigger>-link')
  await expect(trigger).toBeVisible({ timeout: 20000 })

  await instant(page, async () => {
    // For an intent-triggered full prefetch, hover/focus inside the lock so
    // the clean capture includes the policy transition. Do not sleep to warm it.
    await trigger.hover() // DELETE for viewport-triggered prefetch
    await trigger.click()
    await page.waitForURL(isExpectedDestination)

    await expect(page.locator(SHELL_MARKER)).toBeVisible()
    await expect(page.locator(TARGET_MARKER)).toBeVisible()
    await expect(page.locator(TARGET_MARKER)).toHaveText(EXPECTED_TARGET_TEXT)
  })
})
```

`instant()` waits for the locked navigation's prefetch work. Do not add custom
timeouts, retries, network-idle waits, or a pre-test hover. The lock uses a
clean set of entries and the clicked link's strategy; warming the same URL from
another link is not a substitute.

Run this first with the exact link unchanged. If the target already passes
under lock, stop: the existing policy already commits it. Never add
`prefetch={false}` as a test control. Compare automatic prefetching with no prop
against `prefetch={true}`.

For an intent policy, use `trigger.focus()` instead of `hover()` in a separate
test when keyboard focus is part of the promised behavior. Touch normally falls
back to the App Shell unless the product defines and budgets another trigger.

## Temporary RED diagnostic

When verifying the C-gate, temporarily replace the positive target assertion:

```ts
await expect(page.locator(SHELL_MARKER)).toBeVisible()
await expect(page.locator(TARGET_MARKER)).toHaveCount(0)
```

Then, after `instant()` releases:

```ts
await expect(page.locator(TARGET_MARKER)).toBeVisible()
await expect(page.locator(TARGET_MARKER)).toHaveText(EXPECTED_TARGET_TEXT)
```

This proves the target exists but is withheld by the prefetched result. Restore
the positive assertion for the shipped test. If the target is already visible
under the unchanged link policy, there is no optimization gap to guard.

## Optional initial-load contrast

Use this only to document parity. It is not the optimizer verdict because a
document request has no source link or per-link prefetch policy.

```ts
test('direct visit serves the document shell', async ({ page, baseURL }) => {
  await instant(
    page,
    async () => {
      await page.goto('/<destination>')
      await expect(page.locator(SHELL_MARKER)).toBeVisible()
    },
    { baseURL }
  )
})
```

Pass `baseURL` when `page.goto()` is the first navigation. Do not expect the
initial document to reveal content merely because one client link uses
`prefetch={true}`. Do not hardcode target absence either: statically known URL
content may legitimately be in the document shell. Guard its actual direct-load
contract separately.
