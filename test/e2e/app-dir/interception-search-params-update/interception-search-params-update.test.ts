import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('interception-search-params-update', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not intercept route when updating search params on the same page', async () => {
    const browser = await next.browser('/')

    // Navigate to /search - this should be intercepted
    await browser.elementByCss('a[href="/search"]').click()
    await browser.waitForIdleNetwork()

    await retry(async () => {
      const intercepted = await browser.elementById('intercepted-search-page')
      expect(intercepted).toBeTruthy()
    })

    // Hard reload to show the actual page (not intercepted)
    await browser.refresh()
    await browser.waitForIdleNetwork()

    await retry(async () => {
      const searchPage = await browser.elementById('search-page')
      expect(searchPage).toBeTruthy()
    })

    // Now update search params - this should NOT trigger interception
    const input = await browser.elementById('search-input')
    await input.type('test query')
    await browser.waitForIdleNetwork()

    await retry(async () => {
      // Should still be on the search page, not intercepted
      const searchPage = await browser.elementById('search-page')
      expect(searchPage).toBeTruthy()

      // Should NOT show intercepted page
      const intercepted = await browser.elementById('intercepted-search-page')
      expect(intercepted).toBeFalsy()

      // Query should be updated
      const queryText = await browser.elementById('search-query').text()
      expect(queryText).toContain('test query')
    })

    // Verify URL has search params
    const url = await browser.url()
    expect(url).toContain('/search?q=test+query')
  })

  it('should intercept when navigating TO /search from another page', async () => {
    const browser = await next.browser('/search?q=initial')
    await browser.waitForIdleNetwork()

    // Should show the actual page (not intercepted) when directly accessing
    await retry(async () => {
      const searchPage = await browser.elementById('search-page')
      expect(searchPage).toBeTruthy()
    })

    // Navigate away
    await browser.elementByCss('a[href="/"]').click()
    await browser.waitForIdleNetwork()

    // Navigate back to /search - this should be intercepted
    await browser.elementByCss('a[href="/search"]').click()
    await browser.waitForIdleNetwork()

    await retry(async () => {
      const intercepted = await browser.elementById('intercepted-search-page')
      expect(intercepted).toBeTruthy()
    })
  })
})
