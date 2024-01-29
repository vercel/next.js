# Experimental test mode for Playwright

### Prerequisites

You have a Next.js project.

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
    command: 'npm dev -- --experimental-test-proxy',
    url: 'http://localhost:3000',
  },
})
```

### Use the `next/experimental/testmode/playwright` to create tests

```javascript
import { test, expect } from 'next/experimental/testmode/playwright'

test('/product/shoe', async ({ page, next }) => {
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

### Or use the `next/experimental/testmode/playwright/msw`

```javascript
import { test, expect, rest } from 'next/experimental/testmode/playwright/msw'

test.use({
  mswHandlers: [
    rest.get('http://my-db/product/shoe', (req, res, ctx) => {
      return res(
        ctx.status(200),
        ctx.json({
          title: 'A shoe',
        })
      )
    }),
  ],
})

test('/product/shoe', async ({ page, msw }) => {
  msw.use(
    rest.get('http://my-db/product/boot', (req, res, ctx) => {
      return res.once(
        ctx.status(200),
        ctx.json({
          title: 'A boot',
        })
      )
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
