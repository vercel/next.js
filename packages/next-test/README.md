# `@next/test`

### Prerequisites

You have a Next.js project.

### Install `@next/test` and `@playwright/test` in your project

```sh
npm install -D @next/test @playwright/test
```

### Update `playwright.config.ts`

```javascript
import { defineConfig } from '@next/test'

export default defineConfig({
  webServer: {
    command: 'npm dev',
    url: 'http://localhost:3000',
  },
})
```

### Use `@next/test` to create tests

```javascript
import { test, expect } from '@next/test'
import { getProduct } from '@/data/products'

test.describe('integration tests', () => {
  test('/product/shoe', async ({ page, stub }) => {
    // by using `stub` here, the test will proxy all fetches to the test proxy server
    stub(getProduct, ['shoe'], {
      title: 'A shoe',
    })

    await page.goto('/product/shoe')

    await expect(page.locator('body')).toHaveText('A shoe')
  })
})

test.describe('e2e tests', () => {
  test('/product/shoe', async ({ page }) => {
    // since we are not using `stub` here, the test will make real fetches
    await page.goto('/product/shoe')

    await expect(page.locator('body')).toHaveText('A real shoe!')
  })
})
```
