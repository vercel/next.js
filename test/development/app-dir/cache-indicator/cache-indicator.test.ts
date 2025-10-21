import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const enableCacheComponents = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('cache-indicator', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('is none on initial load', async () => {
    const browser = await next.browser('/')

    const badge = await browser.elementByCss('[data-next-badge]')
    const cacheStatus = await badge.getAttribute('data-status')
    expect(cacheStatus).toBe('none')
  })

  if (enableCacheComponents) {
    it('renders the cache warming indicator when navigating to a page that needs to warm the cache', async () => {
      const browser = await next.browser('/')

      // navigate to the navigation page
      const link = await browser.waitForElementByCss('a[href="/navigation"]')
      await link.click()

      await retry(async () => {
        const badge = await browser.elementByCss('[data-next-badge]')
        const cacheStatus = await badge.getAttribute('data-status')
        expect(cacheStatus).toBe('prerendering')
      })

      await retry(async () => {
        const text = await browser.elementByCss('#navigation-page').text()
        expect(text).toContain('Hello navigation page!')
      })

      const badge = await browser.elementByCss('[data-next-badge]')
      const status = await badge.getAttribute('data-status')
      expect(status).toBe('none')
    })
  }
})
