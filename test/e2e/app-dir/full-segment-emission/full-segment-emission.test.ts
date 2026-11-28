import { FileRef, PatchedFileRef, nextTestSetup } from 'e2e-utils'
import { assertNoConsoleErrors, gate, retry } from 'next-test-utils'
import type { Page } from 'playwright'
import { join } from 'node:path'
import { RouteKind } from 'next/dist/server/route-kind'

for (const testingApi of [false, true]) {
  describe(`full-segment-emission testing API ${testingApi}`, () => {
    const { next, isNextStart } = nextTestSetup({
      files: {
        app: new FileRef(join(__dirname, 'app')),
        'proxy.ts': new FileRef(join(__dirname, 'proxy.ts')),
        'next.config.ts': new PatchedFileRef(
          join(__dirname, 'next.config.ts'),
          (content) =>
            testingApi
              ? content.replace(
                  'experimental: {',
                  "experimental: { exposeTestingApiInProductionBuild: process.env.__NEXT_TEST_AXIS !== 'A',"
                )
              : content
        ),
      },
    })

    // Build files exist only in local production tests.
    // @force-gate start
    it('emits full segments only with Cache Components', async () => {
      const cacheComponents = await gate((c) => c.cacheComponents)
      expect(
        await next.hasFile('.next/server/app/index.segments/_full.segment.rsc')
      ).toBe(cacheComponents)
      expect(
        await next.hasFile(
          '.next/server/app/full-segment-emission/concrete.segments/_full.segment.rsc'
        )
      ).toBe(cacheComponents)
      if (cacheComponents) {
        expect(
          await next.hasFile(
            '.next/server/app/full-segment-emission/static/[slug].segments/_full.segment.rsc'
          )
        ).toBe(true)
        expect(
          await next.readFile(
            '.next/server/app/full-segment-emission/static/[slug].html'
          )
        ).toContain('__NEXT_CLIENT_RESUME=fetch')
        expect(
          await next.readFile(
            '.next/server/app/full-segment-emission/static/known.html'
          )
        ).not.toContain('__NEXT_CLIENT_RESUME=fetch')
        expect(
          await next.hasFile(
            '.next/server/app/full-segment-emission/partial/[slug].segments/_full.segment.rsc'
          )
        ).toBe(true)
        const partial = JSON.parse(
          await next.readFile(
            '.next/server/app/full-segment-emission/partial/[slug].meta'
          )
        )
        expect(partial.postponed).toEqual(expect.any(String))
      }
    })

    it('hydrates the retained fully static fallback', async () => {
      const segments: string[] = []
      const browser = await next.browser(
        '/full-segment-emission/static/hydrated',
        {
          beforePageLoad(page: Page) {
            page.on('request', (request) => {
              const segment = request.headers()['next-router-segment-prefetch']
              if (segment) {
                segments.push(segment)
              }
            })
          },
        }
      )
      expect(JSON.parse(await browser.elementById('params').text())).toEqual({
        slug: 'hydrated',
      })
      await browser.elementById('counter').click()
      expect(await browser.elementById('counter').text()).toBe('1')
      if (await gate((c) => !c.dev && c.cacheComponents)) {
        expect(segments).toContain('/_full')
      }
      await assertNoConsoleErrors(browser)
    })

    // This request originates in production fallback hydration.
    // @force-gate !dev && cacheComponents
    it('hydrates when the full request is rewritten to a concrete page', async () => {
      const responses: number[] = []
      const browser = await next.browser(
        '/full-segment-emission/static/rewritten',
        {
          beforePageLoad(page: Page) {
            page.on('response', (response) => {
              if (
                response.request().headers()['next-router-segment-prefetch'] ===
                '/_full'
              ) {
                responses.push(response.status())
              }
            })
          },
        }
      )
      expect(responses).toEqual([200])
      expect(JSON.parse(await browser.elementById('params').text())).toEqual({
        slug: 'known',
      })
      await browser.elementById('counter').click()
      expect(await browser.elementById('counter').text()).toBe('1')
      await assertNoConsoleErrors(browser)
    })

    it('resumes partial fallbacks without a full-segment request', async () => {
      const segments: string[] = []
      const browser = await next.browser(
        '/full-segment-emission/partial/resumed',
        {
          beforePageLoad(page: Page) {
            page.on('request', (request) => {
              const segment = request.headers()['next-router-segment-prefetch']
              if (segment) {
                segments.push(segment)
              }
            })
          },
        }
      )
      expect(await browser.elementById('partial-param').text()).toBe('resumed')
      expect(segments).not.toContain('/_full')
      await assertNoConsoleErrors(browser)
    })

    if (testingApi) {
      // The inspector bootstrap is emitted only by production testing builds.
      // @force-gate !dev && cacheComponents
      it('hydrates from the testing API full segment', async () => {
        const segments: string[] = []
        const browser = await next.browser('/', {
          async beforePageLoad(page: Page) {
            await page.addInitScript(() => {
              document.cookie = 'next-instant-navigation-testing=1; path=/'
            })
            page.on('request', (request) => {
              const segment = request.headers()['next-router-segment-prefetch']
              if (segment) {
                segments.push(segment)
              }
            })
          },
        })
        expect(await browser.elementByCss('p').text()).toBe(
          'Full segment emission'
        )
        expect(segments).toContain('/_full')
        await assertNoConsoleErrors(browser)
      })
    }

    it('applies the same emission policy after ISR', async () => {
      const before = (await next.render$('/full-segment-emission/isr'))(
        '#generation'
      ).text()
      expect(
        (
          await next.fetch('/full-segment-emission/revalidate', {
            method: 'POST',
          })
        ).status
      ).toBe(200)
      await retry(async () => {
        const after = (await next.render$('/full-segment-emission/isr'))(
          '#generation'
        ).text()
        expect(after).not.toBe(before)
      })
      if (isNextStart) {
        const metadata = JSON.parse(
          await next.readFile(
            next.getPrerenderFilePath('/full-segment-emission/isr', '.meta', {
              route: {
                kind: RouteKind.APP_PAGE,
                sourceRoute: '/full-segment-emission/isr/page',
              },
            })
          )
        )
        expect(metadata.segmentPaths.includes('/_full')).toBe(
          await gate((c) => c.cacheComponents)
        )
      }
    })
  })
}
