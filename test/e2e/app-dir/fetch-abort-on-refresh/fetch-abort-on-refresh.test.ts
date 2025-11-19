import { nextTestSetup } from 'e2e-utils'

const describeHeaded = process.env.HEADLESS ? describe.skip : describe

describeHeaded('fetch-abort-on-refresh', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not show abort error in global error boundary when restoring from bfcache', async () => {
    // This test ensures that when restoring a page from the browser bfcache that was pending RSC data,
    // that the abort does not propagate to a user's error boundary.
    const browser = await next.browser('/', { headless: false })

    await browser.elementById('trigger-navigation').click()

    await browser.waitForElementByCss('#root-2')

    // Go back to trigger bfcache restoration
    // we overwrite the typical waitUntil: 'load' option here as the event is never being triggered if we hit the bfcache
    await browser.back({ waitUntil: 'commit' })

    // Check that we're back on the slow page (the page that was first redirected to, before the MPA, not the error boundary)
    // We use element checks instead of eval() because eval() triggers waitForLoadState which times out with bfcache
    const hasSlowPage = await browser.hasElementByCss('#slow-page')
    const hasGlobalError = await browser.hasElementByCss(
      'h2:has-text("Something went wrong!")'
    )

    expect(hasSlowPage).toBe(true)
    expect(hasGlobalError).toBe(false)
  })
})
