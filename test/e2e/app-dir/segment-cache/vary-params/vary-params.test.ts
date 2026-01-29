import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

/**
 * Tests for the "vary params" optimization. Segments that don't access params
 * on the server can have their prefetched data reused across different param
 * values. This includes:
 *
 * 1. Segments without a user-provided layout (only loading.tsx or nothing)
 * 2. Segments with a 'use client' layout (client components don't run on server)
 */
describe('segment cache - vary params', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('prefetching is disabled in dev mode', () => {})
    return
  }

  it('reuses prefetched segment when there is no user-provided layout', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/static', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Prefetch the first link (/static/aaa). This will populate the segment
    // cache with the [param] segment's loading boundary.
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/static/aaa"]'
      )
      await toggle.click()
    })

    // Now prefetch the second link (/static/bbb). Because the [param] segment
    // has no user-provided layout (only loading.tsx), its varyParams is an
    // empty set. This means the segment data from /static/aaa is re-keyed with
    // Fallback and should be reused for /static/bbb.
    //
    // We should NOT see a new prefetch request for the [param] segment's
    // loading boundary - only the page content should be fetched.
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/static/bbb"]'
        )
        await toggle.click()
      },
      // The loading boundary content should NOT be re-fetched because the
      // segment shell is reused from the /static/aaa prefetch.
      { includes: 'Loading [param]', block: 'reject' }
    )

    // Navigate to /static/bbb and verify it works. Since all the data is
    // prefetched, there should be no additional requests during navigation.
    await act(async () => {
      const link = await browser.elementByCss('a[href="/static/bbb"]')
      await link.click()
    }, 'no-requests')

    // Verify the final page content
    const paramPage = await browser.elementById('param-page')
    expect(await paramPage.text()).toContain('Param value: bbb')
  })

  it("reuses prefetched segment when layout is marked with 'use client'", async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/client-layout', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Prefetch the first link (/client-layout/aaa). This will populate the
    // segment cache with the [param] segment's client layout.
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/client-layout/aaa"]'
      )
      await toggle.click()
    })

    // Now prefetch the second link (/client-layout/bbb). Because the [param]
    // segment has a 'use client' layout, it doesn't access params on the
    // server, so its varyParams is an empty set. The segment data from
    // /client-layout/aaa should be reused for /client-layout/bbb.
    //
    // We should NOT see a new prefetch request for the [param] segment's
    // layout - only the page content should be fetched.
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/client-layout/bbb"]'
        )
        await toggle.click()
      },
      // The client layout content should NOT be re-fetched because the segment
      // is reused from the /client-layout/aaa prefetch.
      { includes: 'Client Layout (use client)', block: 'reject' }
    )

    // Navigate to /client-layout/bbb and verify it works. Since all the data
    // is prefetched, there should be no additional requests during navigation.
    await act(async () => {
      const link = await browser.elementByCss('a[href="/client-layout/bbb"]')
      await link.click()
    }, 'no-requests')

    // Verify the final page content
    const paramPage = await browser.elementById('client-layout-param-page')
    expect(await paramPage.text()).toContain('Param value: bbb')
  })
})
