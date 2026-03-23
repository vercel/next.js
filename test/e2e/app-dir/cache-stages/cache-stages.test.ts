import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('cache-stages', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('is skipped', () => {})
    return
  }

  it('unstable_navigation() in "use cache" is omitted from runtime prefetch but included in navigation', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // Reveal the link to trigger a runtime prefetch for /target-page.
    // The prefetch should include static content but NOT the content
    // after unstable_navigation().
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        'input[data-link-accordion="/target-page?q=test"]'
      )
      await linkToggle.click()
    }, [
      {
        includes: 'Included in prefetch',
      },
      {
        includes: 'Not included in prefetch',
        block: 'reject',
      },
    ])

    // Navigate to /target-page. The navigation response should include
    // the content after unstable_navigation().
    await act(
      async () => {
        await browser.elementByCss('a[href="/target-page?q=test"]').click()
      },
      {
        includes: 'Not included in prefetch',
      }
    )

    // Verify the page rendered correctly after navigation.
    expect(await browser.elementByCss('#included-in-prefetch').text()).toBe(
      'Included in prefetch'
    )
    expect(
      await browser.elementByCss('#not-included-in-prefetch').text()
    ).toContain('Not included in prefetch')
  })

  it('cached navigation includes content past unstable_navigation() without a new prefetch', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // Step 1: Reveal the link and navigate to /target-page (first visit).
    // The full navigation response includes all content.
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        'input[data-link-accordion="/target-page?q=test"]'
      )
      await linkToggle.click()
    })
    await browser.elementByCss('a[href="/target-page?q=test"]').click()
    // Wait for navigation to settle by checking for content on the
    // target page.
    await browser.elementByCss('#not-included-in-prefetch')

    // Step 2: Reveal link to /other and navigate away.
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        'input[data-link-accordion="/other"]'
      )
      await linkToggle.click()
    })
    await browser.elementByCss('a[href="/other"]').click()
    // Wait for navigation to settle.
    await browser.elementByCss('h1')

    // Step 3: Reveal the link back to /target-page. The first visit
    // cached the response, so no new prefetch should be initiated.
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        'input[data-link-accordion="/target-page?q=test"]'
      )
      await linkToggle.click()
    }, 'no-requests')

    // Step 4: Navigate back. The cached response includes all content
    // (including past navigation()), so it should render immediately
    // from cache without any network requests.
    await act(async () => {
      await browser.elementByCss('a[href="/target-page?q=test"]').click()
      // Assert inside the act scope: content is visible before any
      // network response could arrive, proving it came from cache.
      expect(await browser.elementByCss('#included-in-prefetch').text()).toBe(
        'Included in prefetch'
      )
      expect(
        await browser.elementByCss('#not-included-in-prefetch').text()
      ).toContain('Not included in prefetch')
    }, 'no-requests')
  })

  it('unstable_navigation() outside "use cache" suspends during prefetch but renders on navigation', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // Reveal the link to trigger a runtime prefetch for /dynamic-page.
    // The dynamic component calls connection() then unstable_navigation(),
    // so its content should be excluded from the prefetch.
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        'input[data-link-accordion="/dynamic-page?q=test"]'
      )
      await linkToggle.click()
    }, [
      {
        includes: 'Static content',
      },
      {
        includes: 'Dynamic content after navigation()',
        block: 'reject',
      },
    ])

    // Navigate to /dynamic-page. The navigation response should include
    // the dynamic content after unstable_navigation().
    await act(
      async () => {
        await browser.elementByCss('a[href="/dynamic-page?q=test"]').click()
      },
      {
        includes: 'Dynamic content after navigation()',
      }
    )

    // Verify the page rendered correctly.
    expect(await browser.elementByCss('#static-content').text()).toBe(
      'Static content'
    )
    expect(await browser.elementByCss('#dynamic-content').text()).toBe(
      'Dynamic content after navigation()'
    )
  })

  it('unstable_navigation() has no effect during static prerender — prefetch includes all content', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // Reveal the link to trigger a prefetch for /static-page.
    // This page has no unstable_instant config, so it's fully static.
    // The prefetch should include ALL content, even content after
    // unstable_navigation(), because static prerenders are not affected
    // by cache stage boundaries.
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        'input[data-link-accordion="/static-page"]'
      )
      await linkToggle.click()
    }, [
      {
        includes: 'Static content before navigation()',
      },
      {
        includes: 'Static content after navigation()',
      },
    ])
  })
})
