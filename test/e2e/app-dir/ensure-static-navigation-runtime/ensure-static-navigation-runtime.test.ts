import { nextTestSetup, Playwright } from 'e2e-utils'
import cheerio from 'cheerio'

// @force-gate !dev
describe('ensureStatic = "navigation" - runtime behavior', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const expectSameStaticResponseForMultipleRequests = async (
    href: string
  ): Promise<string> => {
    const responses = new Set<string>()
    for (let i = 0; i < 4; i++) {
      const response = await next.fetch(href).then((res) => res.text())
      expect(response).not.toBeEmpty()
      responses.add(response)
    }
    const responsesArr = [...responses]
    expect(responsesArr).toHaveLength(1)
    return responsesArr[0]
  }

  const expectNoBrowserErrorLogs = async (browser: Playwright) => {
    const logs = await browser.log()
    expect(
      logs.filter((log) => log.source === 'warning' || log.source === 'error')
    ).toBeEmpty()
  }

  describe('pages without params', () => {
    it('basic', async () => {
      const href = '/default/no-params'
      const response = await expectSameStaticResponseForMultipleRequests(href)
      const $ = cheerio.load(response)
      expect($('#static-content').text()).toBe('Static content')

      const browser = await next.browser(href)
      expect(await browser.elementByCss('#static-content').text()).toBe(
        'Static content'
      )
      await expectNoBrowserErrorLogs(browser)
    })

    it('browser bailout', async () => {
      const href = '/default/browser-bailout'
      const response = await expectSameStaticResponseForMultipleRequests(href)
      const $ = cheerio.load(response)

      // sanity check: browser-only content should not be present
      // (this is not affected by `ensureStatic`)
      expect($('#browser-content-fallback').text()).toBe(
        'Fallback for browser-only content'
      )
      expect($('#browser-content').length).toBe(0)

      // Browser-only content should resolve in the browser (duh)
      const browser = await next.browser(href)
      expect(await browser.elementByCss('#browser-content').text()).toBe(
        'Browser-only content'
      )
      await expectNoBrowserErrorLogs(browser)
    })

    it('client-only IO', async () => {
      const href = '/default/client-io'
      const response = await expectSameStaticResponseForMultipleRequests(href)
      const $ = cheerio.load(response)

      // Client-only IO should not run during SSR if we're serving a static prerender.
      expect($('#client-io-fallback').text()).toBe(
        'Fallback for client-only IO'
      )
      expect($('#client-io').length).toBe(0)

      // Client-only IO should resolve in the browser.
      const browser = await next.browser(href)
      expect(await browser.elementByCss('#client-io').text()).toBe(
        'Client-only IO'
      )
      await expectNoBrowserErrorLogs(browser)
    })
  })

  describe('page with static params', () => {
    const getHref = (slug: string) => `/default/static-params/${slug}`

    describe('serves static results for params that were prerendered at build', () => {
      it.each(['prerendered-1', 'prerendered-2'])('slug: %s', async (slug) => {
        const href = getHref(slug)
        const response = await expectSameStaticResponseForMultipleRequests(href)
        const $ = cheerio.load(response)
        // We should not serve a fallback shell, so the param should be present in the non-hydrated HTML.
        expect($('#slug').text()).toBe(`Slug: ${slug}`)

        const browser = await next.browser(href)
        expect(await browser.elementByCss('#slug').text()).toBe(`Slug: ${slug}`)
        await expectNoBrowserErrorLogs(browser)
      })
    })

    describe('serves static results for params that were not prerendered at build', () => {
      it.each(['not-prerendered-1', 'not-prerendered-2'])(
        'slug: %s',
        async (slug) => {
          const href = getHref(slug)
          const response =
            await expectSameStaticResponseForMultipleRequests(href)
          const $ = cheerio.load(response)
          // We should not serve a fallback shell, so the param should be present in the non-hydrated HTML.
          expect($('#slug').text()).toBe(`Slug: ${slug}`)

          const browser = await next.browser(href)
          expect(await browser.elementByCss('#slug').text()).toBe(
            `Slug: ${slug}`
          )
          await expectNoBrowserErrorLogs(browser)
        }
      )
    })
  })
  describe('page with root params', () => {
    const getHref = (lang: string) => `/with-root-param/${lang}`

    describe('serves static results for params that were prerendered at build', () => {
      it.each(['en', 'pl'])('lang: %s', async (lang) => {
        const href = getHref(lang)
        const response = await expectSameStaticResponseForMultipleRequests(href)
        const $ = cheerio.load(response)
        expect($('#lang').text()).toBe(`Lang: ${lang}`)

        const browser = await next.browser(href)
        expect(await browser.elementByCss('#lang').text()).toBe(`Lang: ${lang}`)
        await expectNoBrowserErrorLogs(browser)
      })
    })

    describe('serves static results for params that were not prerendered at build', () => {
      it.each(['de', 'jp'])('lang: %s', async (lang) => {
        const href = getHref(lang)
        const response = await expectSameStaticResponseForMultipleRequests(href)
        const $ = cheerio.load(response)
        expect($('#lang').text()).toBe(`Lang: ${lang}`)

        const browser = await next.browser(href)
        expect(await browser.elementByCss('#lang').text()).toBe(`Lang: ${lang}`)
        await expectNoBrowserErrorLogs(browser)
      })
    })
  })
})
