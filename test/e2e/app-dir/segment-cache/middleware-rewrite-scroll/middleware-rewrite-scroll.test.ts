import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'

describe('segment cache - middleware rewrite scroll', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('skipped in dev mode', () => {})
    return
  }

  // Regression test: when middleware rewrites a short URL to a deeper
  // internal path (common in i18n/multi-tenant apps), clicking a
  // <Link scroll={false} prefetch={false}> that changes search params
  // should not scroll to top.
  //
  // Root cause: the optimistic navigation triggers a dynamic data fetch.
  // The server response's page segment key includes the search params,
  // which doesn't match the optimistic tree, so a SERVER_PATCH retry is
  // dispatched. The server-patch reducer hardcoded ScrollBehavior.Default,
  // dropping the original scroll={false}. The retry created new cache
  // nodes with scrollRef = { current: true } that were never neutralized.
  it('should not scroll to top when clicking a Link with scroll={false} that changes search params', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Verify the page loaded via middleware rewrite
    await browser.waitForElementByCss('#main-page')

    // Scroll down to an item near the bottom
    await browser.eval(
      'document.getElementById("link-item-40").scrollIntoView({ behavior: "instant" })'
    )
    const scrollBefore = await browser.eval('window.scrollY')
    expect(scrollBefore).toBeGreaterThan(100)

    // Click inside an act scope so every router request spawned by the
    // navigation completes before we assert — the dynamic data fetch, the
    // SERVER_PATCH retry dispatched on the tree mismatch, and the retry's
    // own re-fetch. The buggy scroll reset only fires when the retry
    // commits, so asserting before the queue drains would race the bug.
    //
    // The duplicate expectation pins the retry: 'Item 47' appears exactly
    // once per response body, so satisfying it twice requires two separate
    // router responses (the initial fetch and the retry's re-fetch). If a
    // future change stops the tree mismatch from occurring, this fails
    // rather than letting the test pass without exercising the retry path.
    await act!(async () => {
      await browser.elementById('link-item-40').click()
    }, [{ includes: 'Item 47' }, { includes: 'Item 47' }])

    expect(await browser.url()).toContain('?item=40')

    // Scroll position should be preserved
    const scrollAfter = await browser.eval('window.scrollY')
    expect(scrollAfter).toBe(scrollBefore)
  })
})
