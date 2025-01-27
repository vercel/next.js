import { nextTestSetup } from 'e2e-utils'
import { assertNoConsoleErrors } from 'next-test-utils'

function countSubstring(str: string, substr: string): number {
  return str.split(substr).length - 1
}

describe('ppr-metadata-streaming', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // No dynamic APIs used in metadata
  describe('static metadata', () => {
    it('should generate metadata in head when page is fully static', async () => {
      const $ = await next.render$('/fully-static')
      expect($(`head title`).text()).toBe('fully static')
      expect(countSubstring($.html(), '<title>')).toBe(1)

      const browser = await next.browser('/fully-static')
      expect(await browser.waitForElementByCss('head title').text()).toBe(
        'fully static'
      )
      await assertNoConsoleErrors(browser)
    })

    it('should insert metadata in body when page is dynamic page content', async () => {
      const $ = await next.render$('/dynamic-page')
      expect($(`body title`).text()).toBe('dynamic page')
      expect(countSubstring($.html(), '<title>')).toBe(1)

      const browser = await next.browser('/dynamic-page')
      expect(await browser.waitForElementByCss('body title').text()).toBe(
        'dynamic page'
      )
      await assertNoConsoleErrors(browser)
    })
  })

  // Dynamic APIs used in metadata, metadata should be suspended and inserted into body
  describe('dynamic metadata', () => {
    it('should generate metadata in head when page is fully dynamic', async () => {
      const $ = await next.render$('/fully-dynamic')
      expect($('body title').text()).toBe('fully dynamic')
      expect(countSubstring($.html(), '<title>')).toBe(1)

      const browser = await next.browser('/fully-dynamic')
      expect(await browser.waitForElementByCss('body title').text()).toBe(
        'fully dynamic'
      )
      await assertNoConsoleErrors(browser)
    })

    it('should generate metadata in head when page content is static', async () => {
      const $ = await next.render$('/dynamic-metadata')
      expect($('body title').text()).toBe('dynamic metadata')
      expect(countSubstring($.html(), '<title>')).toBe(1)

      const browser = await next.browser('/dynamic-metadata')
      expect(await browser.waitForElementByCss('body title').text()).toBe(
        'dynamic metadata'
      )
      await assertNoConsoleErrors(browser)
    })
  })

  describe('partial shell', () => {
    it('should insert metadata into body with dynamic metadata and wrapped under layout Suspense boundary', async () => {
      const $ = await next.render$('/dynamic-metadata/partial')
      expect($('body title').text()).toBe('dynamic-metadata - partial')
      expect(countSubstring($.html(), '<title>')).toBe(1)

      const browser = await next.browser('/dynamic-metadata/partial')
      expect(await browser.waitForElementByCss('body title').text()).toBe(
        'dynamic-metadata - partial'
      )
      await assertNoConsoleErrors(browser)
    })

    it('should insert metadata into head with dynamic metadata and dynamic page wrapped under layout Suspense boundary', async () => {
      const $ = await next.render$('/dynamic-page/partial')
      expect($('head title').text()).toBe('dynamic-page - partial')
      expect(countSubstring($.html(), '<title>')).toBe(1)

      const browser = await next.browser('/dynamic-page/partial')
      expect(await browser.waitForElementByCss('head title').text()).toBe(
        'dynamic-page - partial'
      )
      await assertNoConsoleErrors(browser)
    })
  })
})
