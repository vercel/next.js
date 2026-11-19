import { isNextDev, nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'
import { gate } from 'next-test-utils'
;(isNextDev ? describe.skip : describe)(
  'metadata streaming with Cache Components and a wildcard bot list',
  () => {
    const { next, isNextDeploy } = nextTestSetup({
      files: __dirname,
      overrideFiles: {
        'next.config.js': `
          module.exports = {
            cacheComponents: true,
            htmlLimitedBots: /.*/,
          }
        `,
      },
    })

    it('reuses cached segment prefetches when every user agent requires blocking metadata', async () => {
      let page: Playwright.Page
      const segments: Array<
        Promise<{ status: number; headers: Record<string, string> }>
      > = []
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
          page.on('response', (response) => {
            const request = response.request()
            if (
              request.headers()['next-router-segment-prefetch'] !== undefined &&
              new URL(request.url()).pathname.startsWith(
                '/dynamic-metadata/partial'
              )
            ) {
              segments.push(
                response.allHeaders().then((headers) => ({
                  status: response.status(),
                  headers,
                }))
              )
            }
          })
        },
      })
      const act = createRouterAct(page, { includeAppShellRequests: true })
      await act(
        async () => {
          await browser
            .elementByCss(
              'input[data-link-accordion="/dynamic-metadata/partial"]'
            )
            .click()
        },
        { includes: 'Suspenseful Layout', kind: 'static' }
      )

      const isVercel = await gate((conditions) => conditions.vercel)
      const isLegacyVercelDeploy = await gate(
        (conditions) => conditions.vercel && !conditions.adapter
      )
      const responses = await Promise.all(segments)
      expect(responses.length).toBeGreaterThan(0)
      for (const response of responses) {
        expect(response.status).toBe(200)
        // The legacy builder copies HTML metadata headers onto segment outputs.
        // It does not emit the deployment policy that consumes this marker.
        if (!isLegacyVercelDeploy) {
          expect(response.headers['x-next-prelude-metadata']).toBeUndefined()
        }
        if (isVercel) {
          expect(response.headers['x-nextjs-postponed']).toBe('2')
          // The CDN reports seeded prerenders as PRERENDER.
          expect(['HIT', 'PRERENDER']).toContain(
            response.headers['x-vercel-cache']
          )
        }
      }

      await act(
        async () => {
          await browser
            .elementByCss('a[href="/dynamic-metadata/partial"]')
            .click()
          expect(await browser.elementByCss('h2').text()).toBe(
            'Suspenseful Layout'
          )
        },
        isVercel ? undefined : 'no-requests'
      )
      expect(await browser.elementByCss('h2').text()).toBe('Suspenseful Layout')
      expect(await browser.elementByCss('.container').text()).toContain(
        'suspended component'
      )
    })

    it.each(['MyBrowser', 'Googlebot'])(
      'should block metadata while continuing to stream the body for %s',
      async (userAgent) => {
        const abortController = new AbortController()
        let body:
          | (AsyncIterable<Uint8Array> & {
              cancel: () => void
            })
          | undefined

        try {
          const res = await next.fetch('/partial?stream=1', {
            headers: {
              'user-agent': userAgent,
            },
            signal: abortController.signal,
          })

          expect(res.status).toBe(200)
          if (!isNextDeploy) {
            expect(res.headers.get('x-nextjs-postponed')).toBeNull()
          }
          expect(res.body).not.toBeNull()

          body = res.body! as unknown as AsyncIterable<Uint8Array> & {
            cancel: () => void
          }
          let initialHtml = ''

          for await (const chunk of body) {
            initialHtml += Buffer.from(chunk).toString()
            if (initialHtml.includes('dynamic-fallback')) {
              break
            }
          }

          expect(initialHtml).toContain('<title>dynamic title</title>')
          expect(initialHtml).toContain('dynamic-fallback')
          expect(initialHtml).not.toContain('dynamic-content')
        } finally {
          abortController.abort()
          body?.cancel()
        }
      }
    )
  }
)
