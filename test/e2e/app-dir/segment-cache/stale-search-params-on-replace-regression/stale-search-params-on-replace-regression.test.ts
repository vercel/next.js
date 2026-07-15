import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('segment cache - stale search params on replace regression', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('skipped in dev mode', () => {})
    return
  }

  // Regression test for https://github.com/vercel/next.js/issues/91658.
  //
  // Reproduction is taken directly from the user's report and from their
  // minimal repro at https://github.com/dlehmhus/next-router-replace-bug:
  //
  // 1. Build and start the application.
  // 2. Open `/?query=param` directly in the browser (full page load).
  // 3. Click `<Link href="/dummy-page-1">` — navigates to /dummy-page-1.
  // 4. Click `<Link href="/dummy-page-2">` — navigates to /dummy-page-2.
  // 5. Click the button that calls `router.replace('/')`.
  //
  // Expected: URL is `/` with no search string.
  // Buggy:   URL becomes `/?query=param` — the search string from the
  //          original page load is restored.

  it('router.replace to a clean URL clears the search params from the initial page load', async () => {
    const browser = await next.browser('/?query=param')
    await browser.waitForElementByCss('#home')

    await browser.elementById('link-to-dummy-1').click()
    await browser.waitForElementByCss('#dummy-page-1')

    await browser.elementById('link-to-dummy-2').click()
    await browser.waitForElementByCss('#dummy-page-2')

    await browser.elementById('go-home').click()
    await browser.waitForElementByCss('#home')

    await retry(async () => {
      const url = new URL(await browser.url())
      expect(url.pathname).toBe('/')
      expect(url.search).toBe('')
    })
  })
})
