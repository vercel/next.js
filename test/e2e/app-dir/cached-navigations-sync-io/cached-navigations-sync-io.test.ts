import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

// @force-gate prod
describe('cached-navigations-sync-io', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function startBrowser() {
    let page: Playwright.Page | undefined
    const startDate = Date.now()
    const browser = await next.browser('/', {
      async beforePageLoad(browserPage: Playwright.Page) {
        page = browserPage
        await page.clock.install()
        await page.clock.setFixedTime(startDate)
      },
    })
    if (!page) {
      throw new Error('The browser page was not initialized')
    }

    const act = createRouterAct(page)
    await act(
      async () => {
        await browser.elementById('enable-sync-io').click()
      },
      { includes: 'Sync IO enabled' }
    )
    expect(await browser.elementById('sync-io-status').text()).toBe(
      'Sync IO enabled'
    )

    async function navigate(href: string) {
      await browser.elementByCss(`input[data-link-accordion="${href}"]`).click()
      await browser.elementByCss(`a[href="${href}"]`).click()
    }

    return { browser, page, act, startDate, navigate }
  }

  for (const source of ['dynamic RSC', 'initial HTML']) {
    it(`does not reuse uncached time from ${source}`, async () => {
      const { browser, page, act, startDate, navigate } = await startBrowser()

      if (source === 'dynamic RSC') {
        await act(() => navigate('/uncached-time'), {
          includes: 'Dynamic content',
        })
      } else {
        const response = await page.goto(next.url + '/uncached-time')
        expect(response?.status()).toBe(200)
        expect(await response?.text()).toContain('Uncached time:')
      }

      const timestamp = await browser.elementById('timestamp').text()
      expect(timestamp).toMatch(/^Uncached time: \d+$/)

      await act(() => navigate('/hub-b'), { includes: 'Hub B' })
      expect(await browser.elementByCss('h1').text()).toBe('Hub B')
      await page.clock.setFixedTime(startDate + 60_000)

      await act(async () => {
        await act(() => navigate('/uncached-time'), {
          includes: 'Dynamic content',
          block: true,
        })

        const content = await browser.elementByCss('main').text()
        expect(content).not.toContain('Uncached time:')
        expect(content).not.toContain('Dynamic content')
      })

      expect(await browser.elementById('timestamp').text()).not.toBe(timestamp)
      expect(await browser.elementByCss('main').text()).toContain(
        'Dynamic content'
      )
    })
  }

  it('finishes a full prefetch after synchronous IO interrupts its static stage', async () => {
    const { browser, act, navigate } = await startBrowser()
    await act(() => navigate('/uncached-time'), { includes: 'Dynamic content' })
    const timestamp = await browser.elementById('timestamp').text()
    expect(timestamp).toMatch(/^Uncached time: \d+$/)

    await act(() => navigate('/hub-b'), { includes: 'Hub B' })
    await act(
      async () => {
        await browser.eval('window.next.router.refresh()')
      },
      { includes: 'Hub B' }
    )

    // Refresh clears segment data and BFCache but retains the route tree. The
    // full prefetch must fetch new data without a cold static tree prerender.
    const href = '/uncached-time#full-prefetch'
    await act(
      async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${href}"]`)
          .click()
      },
      { includes: 'Dynamic content' }
    )

    await act(async () => {
      await browser.elementByCss(`a[href="${href}"]`).click()
    }, 'no-requests')
    expect(await browser.elementById('timestamp').text()).not.toBe(timestamp)
    expect(await browser.elementByCss('main').text()).toContain(
      'Dynamic content'
    )
  })
})
