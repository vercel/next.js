import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'
import { assertNoConsoleErrors } from 'next-test-utils'

function countSubstring(str: string, substr: string): number {
  return str.split(substr).length - 1
}

describe('ppr-metadata-blocking', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  // No dynamic APIs used in metadata
  describe('static metadata', () => {
    it('should generate metadata in head when page is fully static', async () => {
      const rootSelector = 'head'
      const $ = await next.render$('/fully-static')
      expect($(`${rootSelector} title`).text()).toBe('fully static')
      expect(countSubstring($.html(), '<title>')).toBe(1)

      const browser = await next.browser('/fully-static')
      expect(
        await browser.waitForElementByCss(`${rootSelector} title`).text()
      ).toBe('fully static')
      await assertNoConsoleErrors(browser)
    })

    it('should insert metadata in head when page is dynamic page content', async () => {
      const $ = await next.render$('/dynamic-page')
      expect($(`head title`).text()).toBe('dynamic page')
      expect(countSubstring($.html(), '<title>')).toBe(1)

      const browser = await next.browser('/dynamic-page')
      expect(await browser.waitForElementByCss('head title').text()).toBe(
        'dynamic page'
      )
      await assertNoConsoleErrors(browser)
    })
  })

  // Dynamic APIs used in metadata, metadata should be suspended and inserted into head
  describe('dynamic metadata', () => {
    it('should generate metadata in head when page is fully dynamic', async () => {
      const $ = await next.render$('/fully-dynamic')
      expect($('head title').text()).toBe('fully dynamic')
      expect(countSubstring($.html(), '<title>')).toBe(1)

      const browser = await next.browser('/fully-dynamic')
      expect(await browser.waitForElementByCss('head title').text()).toBe(
        'fully dynamic'
      )
      await assertNoConsoleErrors(browser)
    })

    it('should generate metadata in head when page content is static', async () => {
      const $ = await next.render$('/dynamic-metadata')
      expect(countSubstring($.html(), '<title>')).toBe(1)
      expect($('head title').text()).toBe('dynamic metadata')

      const browser = await next.browser('/dynamic-metadata')
      expect(await browser.waitForElementByCss('head title').text()).toBe(
        'dynamic metadata'
      )
      await assertNoConsoleErrors(browser)
    })
  })

  describe('partial shell', () => {
    it('should insert metadata into head with dynamic metadata and wrapped under layout Suspense boundary', async () => {
      const $ = await next.render$('/dynamic-metadata/partial')
      // Dev: dynamic rendering
      if (isNextDev) {
        expect(countSubstring($.html(), '<title>')).toBe(1)
        expect($('head title').text()).toBe('dynamic-metadata - partial')
      } else {
        // Production: PPR
        expect(countSubstring($.html(), '<title>')).toBe(0)
      }

      const browser = await next.browser('/dynamic-metadata/partial')
      expect(await browser.waitForElementByCss('head title').text()).toBe(
        'dynamic-metadata - partial'
      )
      await assertNoConsoleErrors(browser)
    })

    it('should insert metadata into head with dynamic metadata and dynamic page wrapped under layout Suspense boundary', async () => {
      const rootSelector = 'head'
      const $ = await next.render$('/dynamic-page/partial')
      expect($(`${rootSelector} title`).text()).toBe('dynamic-page - partial')
      expect(countSubstring($.html(), '<title>')).toBe(1)

      const browser = await next.browser('/dynamic-page/partial')
      expect(
        await browser.waitForElementByCss(`${rootSelector} title`).text()
      ).toBe('dynamic-page - partial')
      await assertNoConsoleErrors(browser)
    })
  })

  // Disable deployment until we support it on infra
  if (isNextStart) {
    // This test is only relevant in production mode, as it's testing PPR results
    describe('html limited bots', () => {
      it('should serve partial static shell when normal UA requests the page', async () => {
        const res1 = await next.fetch('/dynamic-page/partial')
        const res2 = await next.fetch('/dynamic-page/partial')

        const $1 = cheerio.load(await res1.text())
        const $2 = cheerio.load(await res2.text())

        const attribute1 = parseInt($1('[data-date]').attr('data-date'))
        const attribute2 = parseInt($2('[data-date]').attr('data-date'))

        // Normal UA should still get the partial static shell produced by PPR
        expect(attribute1).toBe(attribute2)
        expect(attribute1).toBeTruthy()

        const headers = res1.headers

        // Static render should have postponed header
        expect(headers.get('x-nextjs-postponed')).toBe('1')
      })

      it('should not serve partial static shell when html limited bots requests the page', async () => {
        const htmlLimitedBotUA = 'Discordbot'
        const res1 = await next.fetch('/dynamic-page/partial', {
          headers: {
            'User-Agent': htmlLimitedBotUA,
          },
        })

        const res2 = await next.fetch('/dynamic-page/partial', {
          headers: {
            'User-Agent': htmlLimitedBotUA,
          },
        })

        // Dynamic render should not have postponed header
        const headers = res1.headers
        // In blocking mode of metadata, it's still postponed if metadata or page is dynamic.
        // It won't behave differently when the bot is visiting.

        expect(headers.get('x-nextjs-postponed')).toBe(null)

        const $1 = cheerio.load(await res1.text())
        const $2 = cheerio.load(await res2.text())

        const attribute1 = parseInt($1('[data-date]').attr('data-date'))
        const attribute2 = parseInt($2('[data-date]').attr('data-date'))

        // Two requests are dynamic and should not have the same data-date attribute
        expect(attribute2).not.toEqual(attribute1)
        expect(attribute1).toBeTruthy()
      })
    })
  }
})
