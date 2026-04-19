import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('bfcache-regression', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should preserve interactivity after navigating back from an external page', async () => {
    const browser = await next.browser('/')

    // Verify initial state and that the counter is interactive.
    await browser.elementById('increment').click()

    await retry(async () => {
      expect(await browser.elementById('count').text()).toBe('Count: 1')
    })

    // Navigate away to an external page by clicking the link (full page
    // navigation, not a client-side navigation).
    await browser.elementByCss('a[href="https://example.com"]').click()

    await retry(async () => {
      expect(await browser.url()).toContain('example.com')
    })

    // Navigate back (simulates clicking the browser back button).
    await browser.back()

    // After navigating back, the page should be interactive.
    await retry(async () => {
      expect(await browser.elementById('count').text()).toBe('Count: 0')
    })

    await browser.elementById('increment').click()

    await retry(async () => {
      expect(await browser.elementById('count').text()).toBe('Count: 1')
    })
  })
})
