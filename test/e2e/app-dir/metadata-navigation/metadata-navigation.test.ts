import { nextTestSetup } from 'e2e-utils'
import {
  createMultiDomMatcher,
  createMultiHtmlMatcher,
  getTitle,
} from 'next-test-utils'

describe('app dir - metadata navigation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('navigation', () => {
    it('should render root not-found with default metadata', async () => {
      const $ = await next.render$('/does-not-exist')

      // Should contain default metadata and noindex tag
      const matchHtml = createMultiHtmlMatcher($)
      expect($('meta[charset="utf-8"]').length).toBe(1)
      matchHtml('meta', 'name', 'content', {
        viewport: 'width=device-width, initial-scale=1',
        robots: 'noindex',
        // not found metadata
        description: 'Root not found description',
      })
      expect(await $('title').text()).toBe('Root not found')
    })

    it('should support notFound in generateMetadata', async () => {
      const res = await next.fetch('/async/not-found')
      expect(res.status).toBe(404)
      const $ = await next.render$('/async/not-found')

      // TODO-APP: support render custom not-found in SSR for generateMetadata.
      // Check contains root not-found payload in flight response for now.
      let hasRootNotFoundFlight = false
      for (const el of $('script').toArray()) {
        const text = $(el).text()
        if (text.includes('Local found boundary')) {
          hasRootNotFoundFlight = true
        }
      }
      expect(hasRootNotFoundFlight).toBe(true)

      // Should contain default metadata and noindex tag
      const matchHtml = createMultiHtmlMatcher($)
      expect($('meta[charset="utf-8"]').length).toBe(1)
      matchHtml('meta', 'name', 'content', {
        viewport: 'width=device-width, initial-scale=1',
        robots: 'noindex',
      })

      const browser = await next.browser('/async/not-found')
      expect(await browser.elementByCss('h2').text()).toBe(
        'Local found boundary'
      )

      const matchMultiDom = createMultiDomMatcher(browser)
      await matchMultiDom('meta', 'name', 'content', {
        viewport: 'width=device-width, initial-scale=1',
        keywords: 'parent',
        robots: 'noindex',
        // not found metadata
        description: 'Local not found description',
      })
      expect(await getTitle(browser)).toBe('Local not found')
    })

    it('should support redirect in generateMetadata', async () => {
      const res = await next.fetch('/async/redirect', {
        redirect: 'manual',
      })
      expect(res.status).toBe(307)
    })
  })
})
