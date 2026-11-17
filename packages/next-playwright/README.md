# @next/playwright

> - **Status:** Experimental. This API is not yet stable.
> - **Requires:** [Cache Components](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents) to be enabled.

Playwright helpers for testing Next.js applications.

```sh
npm install -D @next/playwright @playwright/test
```

See the [Playwright guide](https://nextjs.org/docs/app/guides/testing/playwright#testing-instant-navigations)
for parameters, initial page loads, production setup, and navigation caveats.

## Instant Navigation Testing

An **instant navigation** commits immediately without waiting for data fetching.
The cached shell — including any Suspense loading boundaries — renders right
away, and dynamic data streams in afterward. The shell is the instant part, not
the full page.

`instant()` lets you test whether a route achieves this. While the callback is
active, navigations render only cached and prefetched content. Dynamic data is
deferred until the callback returns. This separates assertions on the shell from assertions on the completed page.

These checks model a warm cache and test which UI can render without waiting for
dynamic server content. They do not measure cold-cache loading time or prefetch
latency. Missing content may indicate a caching or Suspense-boundary problem, but
check the intended behavior first: a
[same-page search-parameter update](https://nextjs.org/docs/app/guides/testing/playwright#search-parameter-updates)
can retain existing content until fresh data arrives.

### Examples

**Loading shell appears instantly** (dynamic content behind a Suspense boundary):

```ts
import { expect, test } from '@playwright/test'
import { instant } from '@next/playwright'

test('shows loading shell during navigation', async ({ page }) => {
  await page.goto('/')

  await instant(page, async () => {
    await page.click('a[href="/dashboard"]')
    await page.waitForURL((url) => url.pathname === '/dashboard')

    // The loading shell is visible — dynamic data is deferred
    await expect(page.locator('[data-testid="loading"]')).toBeVisible()
  })

  // After instant() returns, dynamic data streams in normally
  await expect(page.locator('[data-testid="content"]')).toBeVisible()
})
```

**Fully instant navigation** (all content is cached):

```ts
import { expect, test } from '@playwright/test'
import { instant } from '@next/playwright'

test('navigates to profile instantly', async ({ page }) => {
  await page.goto('/')

  await instant(page, async () => {
    await page.click('a[href="/profile"]')
    await page.waitForURL((url) => url.pathname === '/profile')

    // All content renders immediately
    await expect(page.locator('[data-testid="profile-name"]')).toBeVisible()
    await expect(page.locator('[data-testid="profile-bio"]')).toBeVisible()
  })
})
```

### Enabling in production builds

In development (`next dev`), the testing API is available by default. In
production builds, it is disabled unless you explicitly opt in during both
`next build` and `next start`:

```js
// next.config.js
module.exports = {
  cacheComponents: true,
  experimental: {
    exposeTestingApiInProductionBuild: true,
  },
}
```

This is not meant to be deployed to live production sites. Only enable it in
controlled testing environments like preview deployments or CI.

## How it works

`instant()` sets a cookie that tells Next.js to serve only cached data during
navigations. While the cookie is active:

- **Client-side navigations**: The router renders only what is available in the
  prefetch cache. Dynamic data is deferred until the cookie is cleared.
- **Server renders (initial load, reload, MPA navigation)**: The server responds
  with only the static shell, without any per-request dynamic data.

When the callback completes, the cookie is cleared and normal behavior resumes.

## Implementation

The helper acquires and releases Next.js's navigation lock through a browser-context
cookie. The [implementation](https://github.com/vercel/next.js/blob/canary/packages/next-playwright/src/index.ts)
shows how the helper scopes the cookie and releases it even when assertions fail.
The cookie encoding is internal; use the helper rather than setting a fixed value.
