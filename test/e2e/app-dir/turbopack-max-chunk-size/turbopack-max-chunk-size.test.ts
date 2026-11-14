import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { createRouterAct } from 'router-act'

// The size limits apply only to Turbopack production builds. Runtime checks also
// run in development; public-asset assertions work on actual deployments too.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip).each([false, true])(
  'turbopack max chunk size, minify before chunking: %s',
  (minifyBeforeChunking) => {
    const { next, isNextDev } = nextTestSetup({
      files: __dirname,
      overrideFiles: {
        // Share the controlled payload modules with the local CLI chunk matrix.
        components: new FileRef(
          join(
            __dirname,
            '../../../production/app-dir/turbopack-chunking/components'
          )
        ),
        'components/link-accordion.tsx': new FileRef(
          join(
            __dirname,
            '../segment-cache/staleness/components/link-accordion.tsx'
          )
        ),
      },
      env: { TEST_MINIFY_BEFORE_CHUNKING: String(minifyBeforeChunking) },
    })

    it.each([
      ['/', '#home', 'max chunk size home', '#bulky-b'],
      ['/other', '#other', 'max chunk size other', '#bulky-c'],
    ])(
      'renders %s with explicit client and server limits',
      async (path, selector, title, payload) => {
        const $ = await next.render$(path)
        expect($(selector).text()).toBe(title)
        expect($('#bulky-a').text()).toMatch(/^bulky-a:\d+$/)
        expect($(payload).text()).toMatch(/^bulky-[bc]:\d+$/)
      }
    )

    it('hydrates a lazy chunk and navigates without a document reload', async () => {
      let act: ReturnType<typeof createRouterAct>
      const browser = await next.browser('/', {
        beforePageLoad(page) {
          act = createRouterAct(page, { includeAppShellRequests: true })
        },
      })
      await browser.elementByCss('#counter').click()
      expect(await browser.elementByCss('#counter').text()).toBe('count: 1')
      await browser.eval('window.__maxChunkDocument = "retained"')
      await act!(
        async () => {
          await browser
            .elementByCss('input[data-link-accordion="/other"]')
            .click()
          await browser.elementByCss('a[href="/other"]').click()
        },
        { includes: 'max chunk size other' }
      )
      expect(await browser.elementByCss('#other').text()).toBe(
        'max chunk size other'
      )
      expect(await browser.elementByCss('#bulky-c').text()).toMatch(
        /^bulky-c:\d+$/
      )
      expect(await browser.eval('window.__maxChunkDocument')).toBe('retained')
    })

    // Maximum-size splitting is production-only; deployment assertions stay active.
    ;(isNextDev ? describe.skip : describe)('production output', () => {
      it('serves the separated client payload chunks from public script URLs', async () => {
        const $ = await next.render$('/')
        const urls = $('script[src]')
          .map((_, script) => $(script).attr('src'))
          .get()
        expect(urls.length).toBeGreaterThan(0)
        const sources = await Promise.all(
          urls.map(async (url) => {
            const response = await next.fetch(url)
            expect(response.status).toBe(200)
            return response.text()
          })
        )
        const aChunks = sources.filter((source) =>
          source.includes('bulky-a-item-399-')
        )
        const bChunks = sources.filter((source) =>
          source.includes('bulky-b-item-399-')
        )
        expect(aChunks.length).toBeGreaterThan(0)
        expect(bChunks.length).toBeGreaterThan(0)
        // Each controlled payload fits the 20 KB estimate; together they don't.
        // Do not cap complete emitted files, which include wrappers and runtime.
        expect(
          aChunks.every((source) => !source.includes('bulky-b-item-399-'))
        ).toBe(true)
      })
    })
  }
)
