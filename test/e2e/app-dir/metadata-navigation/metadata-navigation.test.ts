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
      const flightDataPrefix = 'self.__next_f.push([1,"'
      const flightDataSuffix = '"])'
      let flightText = ''
      for (const el of $('script').toArray()) {
        const text = $(el).text()
        if (text.startsWith(flightDataPrefix)) {
          flightText += text.slice(
            flightDataPrefix.length,
            -flightDataSuffix.length
          )
        }
      }
      expect(flightText).toContain('Local found boundary')

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

    it('should show the index title', async () => {
      const browser = await next.browser('/parallel-route')
      expect(await browser.elementByCss('title').text()).toBe('Home Layout')
    })

    it('should show target page metadata after navigation', async () => {
      const browser = await next.browser('/parallel-route')
      await browser.elementByCss('#product-link').click()
      await browser.waitForElementByCss('#product-title')
      expect(await browser.elementByCss('title').text()).toBe('Product Layout')
    })

    it('should show target page metadata after navigation with back', async () => {
      const browser = await next.browser('/parallel-route')
      await browser.elementByCss('#product-link').click()
      await browser.waitForElementByCss('#product-title')
      await browser.elementByCss('#home-link').click()
      await browser.waitForElementByCss('#home-title')
      expect(await browser.elementByCss('title').text()).toBe('Home Layout')
    })
  })
})
