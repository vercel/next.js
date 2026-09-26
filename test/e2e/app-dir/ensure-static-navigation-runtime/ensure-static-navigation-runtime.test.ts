import { nextTestSetup, Playwright } from 'e2e-utils'
import cheerio from 'cheerio'

// @force-gate !dev
describe('ensureStatic = "navigation" - runtime behavior', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const HTML = 'html' as const
  const RSC = 'rsc' as const

  const expectSameStaticResponseForMultipleRequests = async (
    href: string,
    requestKind: 'html' | 'rsc' = 'html'
  ): Promise<string> => {
    const responses = new Set<string>()
    const headers = requestKind === RSC ? { rsc: '1' } : {}
    for (let i = 0; i < 4; i++) {
      const response = await next
        .fetch(href, { headers })
        .then((res) => res.text())
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

    const testImpl = async (slug: string, kind: 'html' | 'rsc') => {
      const href = getHref(slug)
      const response = await expectSameStaticResponseForMultipleRequests(
        href,
        kind
      )
      const expected = `Slug: ${slug}`
      if (kind === HTML) {
        // We should not serve a fallback + resume, so the param should
        // be present in the initial HTML.
        const $ = cheerio.load(response)
        expect($('#slug').text()).toBe(expected)
      } else {
        expect(response).toContain(expected)
      }

      const browser = await next.browser(href)
      expect(await browser.elementByCss('#slug').text()).toBe(expected)
      await expectNoBrowserErrorLogs(browser)
    }

    describe('serves static results for params that were prerendered at build', () => {
      it.each([
        { slug: 'prerendered-1', kind: HTML },
        { slug: 'prerendered-2', kind: RSC },
      ])('slug: $slug - $kind', async ({ slug, kind }) => {
        await testImpl(slug, kind)
      })
    })

    describe('serves blocking static results for params that were not prerendered at build', () => {
      it('HTML request', async () => {
        const slug = 'not-prerendered-1'
        const kind = HTML
        await testImpl(slug, kind)
      })

      // TODO(ensure-static): RSC requests are still dynamic until revalidation finishes
      it.failing('RSC request', async () => {
        const slug = 'not-prerendered-2'
        const kind = RSC
        await testImpl(slug, kind)
      })
    })
  })

  describe('page with root params', () => {
    const getHref = (lang: string) => `/with-root-param/${lang}`

    const testImpl = async (lang: string, kind: 'rsc' | 'html') => {
      const href = getHref(lang)
      const response = await expectSameStaticResponseForMultipleRequests(
        href,
        kind
      )
      const expected = `Lang: ${lang}`
      if (kind === HTML) {
        const $ = cheerio.load(response)
        expect($('#lang').text()).toBe(expected)
      } else {
        expect(response).toContain(expected)
      }

      const browser = await next.browser(href)
      expect(await browser.elementByCss('#lang').text()).toBe(`Lang: ${lang}`)
      await expectNoBrowserErrorLogs(browser)
    }

    describe('serves static results for params that were prerendered at build', () => {
      it.each([
        { lang: 'en', kind: HTML },
        { lang: 'pl', kind: RSC },
      ])('lang: $lang - $kind', async ({ lang, kind }) => {
        await testImpl(lang, kind)
      })
    })

    describe('serves static results for params that were not prerendered at build', () => {
      it('HTML request', async () => {
        const lang = 'de'
        const kind = HTML
        await testImpl(lang, kind)
      })
      // TODO(ensure-static): RSC requests are still dynamic until revalidation finishes
      it.failing('RSC request', async () => {
        const lang = 'jp'
        const kind = RSC
        await testImpl(lang, kind)
      })
    })
  })
})
