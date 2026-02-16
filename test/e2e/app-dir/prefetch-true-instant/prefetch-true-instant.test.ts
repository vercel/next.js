import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('prefetch={true} with instant route', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    it('is skipped', () => {})
    return
  }

  it('does not include dynamic content in the prefetch when the target route has instant', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // Reveal the link to trigger a prefetch. Even though the Link has
    // prefetch={true}, the route has unstable_instant defined, so the
    // prefetch should be downgraded — it should include cached content
    // but NOT dynamic content.
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        'input[data-link-accordion="/target-page"]'
      )
      await linkToggle.click()
    }, [
      {
        includes: 'Cached content',
      },
      {
        includes: 'Dynamic content',
        block: 'reject',
      },
    ])

    // Navigate to the page. Block the navigation request so we can
    // verify which parts appear instantly from the prefetch cache.
    await act(async () => {
      await act(
        async () => {
          await browser.elementByCss('a[href="/target-page"]').click()
        },
        {
          // Temporarily block the navigation request that fetches the
          // dynamic content. While blocked, the cached parts should
          // already be visible on screen.
          includes: 'Dynamic content',
          block: true,
        }
      )
      // The cached content should be visible immediately from the prefetch.
      expect(await browser.elementById('cached-content').text()).toContain(
        'Cached content'
      )
      // The dynamic content should NOT be on screen yet because the
      // navigation response is still blocked.
      const dynamicElement = await browser.elementsByCss('#dynamic-content')
      expect(dynamicElement.length).toBe(0)
    })

    // After the navigation response is unblocked, both parts should
    // be visible.
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )
    expect(await browser.elementById('dynamic-content').text()).toEqual(
      'Dynamic content'
    )
  })

  it('also disables full prefetch when instant is on a layout, not the page', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // The layout has unstable_instant but the page does not. The
    // SubtreeHasInstant bit should propagate up from the layout, so
    // prefetch={true} on the Link should still be downgraded.
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        'input[data-link-accordion="/layout-instant"]'
      )
      await linkToggle.click()
    }, [
      {
        includes: 'Cached content',
      },
      {
        includes: 'Dynamic content',
        block: 'reject',
      },
    ])

    // Navigate and verify the cached content appears instantly.
    await act(async () => {
      await act(
        async () => {
          await browser.elementByCss('a[href="/layout-instant"]').click()
        },
        {
          includes: 'Dynamic content',
          block: true,
        }
      )
      expect(await browser.elementById('cached-content').text()).toContain(
        'Cached content'
      )
      const dynamicElement = await browser.elementsByCss('#dynamic-content')
      expect(dynamicElement.length).toBe(0)
    })

    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )
    expect(await browser.elementById('dynamic-content').text()).toEqual(
      'Dynamic content'
    )
  })
})
