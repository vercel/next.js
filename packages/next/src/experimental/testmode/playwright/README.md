# Experimental test mode for Playwright

For setup and request handling behavior, see [Mocking external requests with experimental test mode](https://nextjs.org/docs/app/guides/testing/playwright#mocking-external-requests-with-experimental-test-mode).
This fetch-mocking integration is separate from `@next/playwright`'s `instant()` helper for testing instant navigation.

### Prerequisites

You have a Next.js project.

### Update `next.config.js`

```javascript
module.exports = {
  experimental: {
    testProxy: true,
  },
}
```

### Install `@playwright/test` in your project

```sh
npm install -D @playwright/test
```

### Optionally install MSW in your project

[MSW](https://mswjs.io/) can be helpful for fetch mocking.

```sh
npm install -D msw
```

### Update `playwright.config.ts`

```javascript
import { defineConfig } from 'next/experimental/testmode/playwright'

export default defineConfig({
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
  },
})
```

### Use the `next/experimental/testmode/playwright` to create tests

```javascript
// Place this file in the `app` directory and name it with `.spec.ts`.
// To customize where to put tests, add `testMatch` to `playwright.config.ts`.

import { test, expect } from 'next/experimental/testmode/playwright'

test('/product/shoe', async ({ page, next }) => {
  // `next.onFetch` intercepts external browser fetches and server requests
  // associated with this test. A same-origin browser fetch (e.g. `/api/hello`)
  // reaches the Next.js Route Handler normally; its external fetches can be mocked.
  next.onFetch((request) => {
    if (request.url === 'http://my-db/product/shoe') {
      return new Response(
        JSON.stringify({
          title: 'A shoe',
        }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    }
    return 'abort'
  })

  await page.goto('/product/shoe')

  await expect(page.locator('body')).toHaveText(/Shoe/)
})
```

Handlers run newest first. Return a `Response` to mock, `'continue'` to pass through, or `'abort'` to cancel a request. Returning `undefined` tries earlier handlers. By default, unhandled requests are aborted; an unhandled server fetch throws `Proxy request aborted [METHOD URL]`. With `fetchLoopback` enabled, unhandled requests use the test worker's `fetch` instead.

### Or use the `next/experimental/testmode/playwright/msw`

```javascript
import {
  test,
  expect,
  http,
  HttpResponse,
  passthrough,
} from 'next/experimental/testmode/playwright/msw'

test.use({
  mswHandlers: [
    [
      http.get('http://my-db/product/shoe', () => {
        return HttpResponse.json({
          title: 'A shoe',
        })
      }),
      // allow all non-mocked routes to pass through
      http.all('*', () => {
        return passthrough()
      }),
    ],
    { scope: 'test' }, // or 'worker'
  ],
})

test('/product/shoe', async ({ page, msw }) => {
  msw.use(
    http.get('http://my-db/product/boot', () => {
      return HttpResponse.json({
        title: 'A boot',
      })
    })
  )

  await page.goto('/product/boot')

  await expect(page.locator('body')).toHaveText(/Boot/)
})
```

### Or use your favorite Fetch mocking library

The "fetch loopback" mode can be configured in the `playwright.config.ts` or
via `test.use()` with a test module. This option loops `fetch()` calls via
the `fetch()` of the current test's worker.

```javascript
import { test, expect } from 'next/experimental/testmode/playwright'
import { myFetchMocker } from 'my-fetch-mocker'

test.use({ nextOptions: { fetchLoopback: true } })

test('/product/shoe', async ({ page, next }) => {
  myFetchMocker.mock('http://my-db/product/shoe', {
    title: 'A shoe',
  })

  await page.goto('/product/shoe')

  await expect(page.locator('body')).toHaveText(/Shoe/)
})
```
