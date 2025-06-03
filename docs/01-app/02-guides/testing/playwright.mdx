---
title: How to set up Playwright with Next.js
nav_title: Playwright
description: Learn how to set up Playwright with Next.js for End-to-End (E2E) Testing.
---

Playwright is a testing framework that lets you automate Chromium, Firefox, and WebKit with a single API. You can use it to write **End-to-End (E2E)** testing. This guide will show you how to set up Playwright with Next.js and write your first tests.

## Quickstart

The fastest way to get started is to use `create-next-app` with the [with-playwright example](https://github.com/vercel/next.js/tree/canary/examples/with-playwright). This will create a Next.js project complete with Playwright configured.

```bash filename="Terminal"
npx create-next-app@latest --example with-playwright with-playwright-app
```

## Manual setup

To install Playwright, run the following command:

```bash filename="Terminal"
npm init playwright
# or
yarn create playwright
# or
pnpm create playwright
```

This will take you through a series of prompts to setup and configure Playwright for your project, including adding a `playwright.config.ts` file. Please refer to the [Playwright installation guide](https://playwright.dev/docs/intro#installation) for the step-by-step guide.

## Creating your first Playwright E2E test

Create two new Next.js pages:

<AppOnly>

```tsx filename="app/page.tsx"
import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <h1>Home</h1>
      <Link href="/about">About</Link>
    </div>
  )
}
```

```tsx filename="app/about/page.tsx"
import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <h1>About</h1>
      <Link href="/">Home</Link>
    </div>
  )
}
```

</AppOnly>

<PagesOnly>

```tsx filename="pages/index.ts"
import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <h1>Home</h1>
      <Link href="/about">About</Link>
    </div>
  )
}
```

```tsx filename="pages/about.ts"
import Link from 'next/link'

export default function About() {
  return (
    <div>
      <h1>About</h1>
      <Link href="/">Home</Link>
    </div>
  )
}
```

</PagesOnly>

Then, add a test to verify that your navigation is working correctly:

```ts filename="tests/example.spec.ts"
import { test, expect } from '@playwright/test'

test('should navigate to the about page', async ({ page }) => {
  // Start from the index page (the baseURL is set via the webServer in the playwright.config.ts)
  await page.goto('http://localhost:3000/')
  // Find an element with the text 'About' and click on it
  await page.click('text=About')
  // The new URL should be "/about" (baseURL is used there)
  await expect(page).toHaveURL('http://localhost:3000/about')
  // The new page should contain an h1 with "About"
  await expect(page.locator('h1')).toContainText('About')
})
```

> **Good to know**: You can use `page.goto("/")` instead of `page.goto("http://localhost:3000/")`, if you add [`"baseURL": "http://localhost:3000"`](https://playwright.dev/docs/api/class-testoptions#test-options-base-url) to the `playwright.config.ts` [configuration file](https://playwright.dev/docs/test-configuration).

### Running your Playwright tests

Playwright will simulate a user navigating your application using three browsers: Chromium, Firefox and Webkit, this requires your Next.js server to be running. We recommend running your tests against your production code to more closely resemble how your application will behave.

Run `npm run build` and `npm run start`, then run `npx playwright test` in another terminal window to run the Playwright tests.

> **Good to know**: Alternatively, you can use the [`webServer`](https://playwright.dev/docs/test-webserver/) feature to let Playwright start the development server and wait until it's fully available.

### Running Playwright on Continuous Integration (CI)

Playwright will by default run your tests in the [headless mode](https://playwright.dev/docs/ci#running-headed). To install all the Playwright dependencies, run `npx playwright install-deps`.

You can learn more about Playwright and Continuous Integration from these resources:

- [Next.js with Playwright example](https://github.com/vercel/next.js/tree/canary/examples/with-playwright)
- [Playwright on your CI provider](https://playwright.dev/docs/ci)
- [Playwright Discord](https://discord.com/invite/playwright-807756831384403968)
