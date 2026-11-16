import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { createRouterAct } from 'router-act'
import type * as Playwright from 'playwright'

// The legacy builder omits the RSC continuation for static build outputs.
// @force-gate prefetching && (!deploy || adapter)
describe('static-to-partial RSC', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it.each(['navigation', 'runtime-prefetch', 'runtime-shell'])(
    'renders %s with request data after revalidation',
    async (kind) => {
      const pathname = '/static-to-partial-rsc/' + kind
      const initial = await next.render$(pathname)
      expect(initial('#build-content').text()).toBe('Build-time content')

      const revalidation = await next.fetch(
        '/static-to-partial-rsc/revalidate?' +
          new URLSearchParams({ path: pathname }),
        { method: 'POST' }
      )
      expect(revalidation.status).toBe(200)

      // Wait for invalidation to replace the build output before opening the
      // router.
      await retry(async () => {
        const $ = await next.render$(pathname)
        expect($('#caller').text()).toBe('Caller: none')
      }, 10_000)

      for (const caller of ['first', 'second']) {
        let page: Playwright.Page
        const browser = await next.browser('/', {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        const act = createRouterAct(page, { includeAppShellRequests: true })

        try {
          await browser.addCookie({ name: 'caller', value: caller })
          await browser.eval('window.__beforeNavigation = true')

          if (kind === 'navigation') {
            await act(
              async () => {
                await browser
                  .elementByCss(`input[data-link-accordion="${pathname}"]`)
                  .click()
                await browser.elementByCss(`a[href="${pathname}"]`).click()
              },
              { includes: 'Caller: ' + caller }
            )
          } else {
            await act(
              async () => {
                await browser
                  .elementByCss(`input[data-link-accordion="${pathname}"]`)
                  .click()
              },
              {
                includes:
                  kind === 'runtime-prefetch'
                    ? 'Prefetch content'
                    : 'Caller: ' + caller,
                kind: 'runtime',
              }
            )

            await act(
              async () => {
                await browser.elementByCss(`a[href="${pathname}"]`).click()
                expect(await browser.elementById('caller').text()).toBe(
                  'Caller: ' + caller
                )
                if (kind === 'runtime-shell') {
                  expect(
                    await browser.elementById('prefetch-fallback').text()
                  ).toBe('Waiting for prefetch')
                } else {
                  expect(
                    await browser.elementById('prefetch-content').text()
                  ).toBe('Prefetch content')
                }
                expect(
                  await browser.elementById('navigation-fallback').text()
                ).toBe('Waiting for navigation')
              },
              { includes: 'Navigation content' }
            )
          }

          expect(await browser.eval('window.__beforeNavigation')).toBe(true)
          expect(await browser.elementById('caller').text()).toBe(
            'Caller: ' + caller
          )
          expect(await browser.elementById('prefetch-content').text()).toBe(
            'Prefetch content'
          )
          expect(await browser.elementById('navigation-content').text()).toBe(
            'Navigation content'
          )
        } finally {
          await browser.deleteCookies()
        }
      }
    }
  )
})
