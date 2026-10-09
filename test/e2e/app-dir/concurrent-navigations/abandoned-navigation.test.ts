import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('abandoned navigation', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('disabled in development', () => {})
    return
  }

  function relativeHref(href: string) {
    const url = new URL(href)
    return url.pathname + url.search + url.hash
  }

  it(
    'stays on the newer page when the dynamic request of a superseded ' +
      'navigation fails',
    async () => {
      let page: Playwright.Page
      const documentRequests: Array<string> = []
      const browser = await next.browser('/abandoned-navigation', {
        beforePageLoad(p: Playwright.Page) {
          page = p
          p.on('request', (request) => {
            if (request.isNavigationRequest()) {
              documentRequests.push(relativeHref(request.url()))
            }
          })
        },
      })
      const act = createRouterAct(page, { allowErrorStatusCodes: [503] })

      await act(
        async () => {
          const toggle = await browser.elementByCss(
            'input[data-link-accordion="/abandoned-navigation/slow?error-status=503"]'
          )
          await toggle.click()
        },
        { includes: 'Loading slow page...' }
      )

      await act(
        async () => {
          const toggle = await browser.elementByCss(
            'input[data-link-accordion="/abandoned-navigation/other"]'
          )
          await toggle.click()
        },
        { includes: 'Other page content' }
      )

      await act(
        async () => {
          const slowLink = await browser.elementByCss(
            'a[href="/abandoned-navigation/slow?error-status=503"]'
          )
          await slowLink.click()
          const slowLoading = await browser.elementById('slow-page-loading')
          expect(await slowLoading.text()).toBe('Loading slow page...')

          const otherLink = await browser.elementByCss(
            'a[href="/abandoned-navigation/other"]'
          )
          await otherLink.click()
          const otherContent = await browser.elementById('other-page-content')
          expect(await otherContent.text()).toBe('Other page content')
        },
        { includes: 'Navigation failed' }
      )

      expect(relativeHref(await browser.url())).toBe(
        '/abandoned-navigation/other'
      )
      const otherContent = await browser.elementById('other-page-content')
      expect(await otherContent.text()).toBe('Other page content')
      expect(documentRequests).toEqual(['/abandoned-navigation'])
    }
  )
})
