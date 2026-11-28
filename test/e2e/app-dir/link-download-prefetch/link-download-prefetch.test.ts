import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('link-download-prefetch', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('prefetching is disabled', () => {})
    return
  }

  // App Shell prefetches are ignored by `act` by default. Include them so
  // 'no-requests' fails on any request that would reach the Route Handler.
  async function openHomePage() {
    let act: ReturnType<typeof createRouterAct>
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
        act = createRouterAct(p, { includeAppShellRequests: true })
      },
    })
    return { browser, act: act!, page: page! }
  }

  it('prefetches a regular Link', async () => {
    const { browser, act } = await openHomePage()

    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/target"]')
          .click()
        await browser.elementByCss('a[href="/target"]')
      },
      { includes: 'Target page content' }
    )
  })

  it.each([
    ['the default prefetch', '/export?variant=auto'],
    ['prefetch={true}', '/export?variant=full'],
  ])(
    'does not prefetch a Link with a download attribute and %s',
    async (_, href) => {
      const { browser, act } = await openHomePage()

      // Reveal the link. It enters the viewport, which would normally schedule
      // a prefetch that runs the Route Handler.
      await act(async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${href}"]`)
          .click()
        await browser.elementByCss(`a[href="${href}"]`)
      }, 'no-requests')

      // Hovering would normally upgrade or re-trigger the prefetch.
      const link = await browser.elementByCss(`a[href="${href}"]`)
      await act(async () => {
        await link.hover()
      }, 'no-requests')
    }
  )

  it('lets the browser download the file on click without a router request', async () => {
    const { browser, act, page } = await openHomePage()
    const href = '/export?variant=auto'

    await act(async () => {
      await browser.elementByCss(`input[data-link-accordion="${href}"]`).click()
    }, 'no-requests')

    const downloadPromise = page.waitForEvent('download')
    await act(async () => {
      await browser.elementByCss(`a[href="${href}"]`).click()
    }, 'no-requests')

    const download = await downloadPromise
    // The handler sends `Content-Disposition: attachment` without a filename,
    // so the browser only uses the `download` attribute's filename when it
    // handles the click itself instead of a client-side navigation.
    expect(download.suggestedFilename()).toBe('report.csv')
    expect(new URL(await browser.url()).pathname).toBe('/')
  })
})
