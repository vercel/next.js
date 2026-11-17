import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('cached-navigations-dynamic-rsc', () => {
  const { next } = nextTestSetup({
    files: path.join(
      __dirname,
      '../../../e2e/app-dir/segment-cache/cached-navigations/default'
    ),
  })

  async function expectDynamicMissPolicy(source: string) {
    const manifest = await next.readJSON('.next/prerender-manifest.json')
    expect(manifest.dynamicRoutes[source].rscCompute).toEqual({
      resolvedPathname: 'dynamic',
      completedShell: 'dynamic',
    })
  }

  it('does not cache synchronous IO after a novel param resolves', async () => {
    await expectDynamicMissPolicy('/partial-dynamic-miss/[top]')
    const route = '/partial-dynamic-miss/time'
    const hub = '/fallback-params-hub/time/a'
    let page: Playwright.Page
    const browser = await next.browser('/fallback-params-hub/time/start', {
      async beforePageLoad(browserPage: Playwright.Page) {
        page = browserPage
        await page.clock.install()
      },
    })
    const act = createRouterAct(page)

    await act(
      async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${route}"]`)
          .click()
        await browser.elementByCss(`a[href="${route}"]`).click()
      },
      { includes: 'Top:' }
    )
    const timestamp = await browser.elementById('timestamp').text()
    expect(timestamp).not.toBe('')

    await act(
      async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${hub}"]`)
          .click()
        await browser.elementByCss(`a[href="${hub}"]`).click()
      },
      { includes: 'Fallback params hub a' }
    )
    await page.clock.fastForward(60_000)

    await act(async () => {
      await act(
        async () => {
          await browser
            .elementByCss(`input[data-link-accordion="${route}"]`)
            .click()
          await browser.elementByCss(`a[href="${route}"]`).click()
        },
        { includes: 'Top:', block: true }
      )

      expect(await page.locator('#top:visible').count()).toBe(0)
    })
    expect(await browser.elementById('timestamp').text()).not.toBe(timestamp)
  })

  it('finishes a full prefetch after synchronous IO interrupts its shell', async () => {
    await expectDynamicMissPolicy('/dynamic-miss/[top]')
    const route = '/dynamic-miss/time'

    let page: Playwright.Page
    const browser = await next.browser('/fallback-params-hub/time/start', {
      beforePageLoad(browserPage: Playwright.Page) {
        page = browserPage
      },
    })
    const act = createRouterAct(page)
    await act(
      async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${route}"]`)
          .click()
        await browser.elementByCss(`a[href="${route}"]`).click()
      },
      { includes: 'Top:' }
    )
    const timestamp = await browser.elementById('timestamp').text()

    const hub = '/fallback-params-hub/time/a'
    await act(
      async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${hub}"]`)
          .click()
        await browser.elementByCss(`a[href="${hub}"]`).click()
      },
      { includes: 'Fallback params hub a' }
    )
    await act(
      async () => {
        await browser.eval('window.next.router.refresh()')
      },
      { includes: 'Fallback params hub a' }
    )

    // Refresh clears segment data and BFCache but retains the route tree. The
    // full prefetch must fetch new data without a cold static tree prerender.
    const fullPrefetchLink = `${route}#full-prefetch`
    await act(
      async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${fullPrefetchLink}"]`)
          .click()
      },
      { includes: 'Top:' }
    )

    await act(async () => {
      await browser.elementByCss(`a[href="${fullPrefetchLink}"]`).click()
    }, 'no-requests')
    expect(await browser.elementById('top').text()).toBe('Top: time')
    expect(await browser.elementById('timestamp').text()).not.toBe(timestamp)
  })
})
