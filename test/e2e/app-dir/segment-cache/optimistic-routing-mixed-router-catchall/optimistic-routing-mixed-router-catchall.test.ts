import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'

describe('optimistic routing - mixed router optional catch-all shadowing', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    // Optimistic routing is a production-build feature; in dev mode the
    // router does not have complete information about which routes
    // exist, so prediction is disabled.
    test('skipped in dev mode', () => {})
    return
  }

  // The app defines an App Router optional catch-all at
  // /docs/[[...slug]] AND a Pages Router page at /docs (pages/docs.tsx).
  // This builds successfully: the same-specificity validation only runs
  // within the App Router, and the cross-router conflict check only
  // rejects exact path collisions. At runtime the static Pages route
  // wins for /docs, while the App catch-all serves /docs/<anything>.
  //
  // After the client learns the /docs/[[...slug]] pattern (by
  // prefetching /docs/a), a navigation to /docs must NOT be predicted
  // from that pattern — /docs belongs to the Pages Router, which the
  // optimistic route matcher cannot see. With the bug, the router
  // fabricates a synthetic App Router entry for /docs (optional
  // catch-all matched with zero segments) and instantly commits the
  // App Router tree; the Pages content only appears after the
  // mismatch-correction machinery kicks in, if at all.
  it('does not predict an optional catch-all match for a URL owned by the Pages Router', async () => {
    let act: ReturnType<typeof createRouterAct>
    let capturedPage: any = null
    const browser = await next.browser('/', {
      beforePageLoad(page: any) {
        act = createRouterAct(page)
        capturedPage = page
      },
    })

    // Reveal the /docs/a link and let its prefetch complete. This
    // teaches the router the /docs/[[...slug]] pattern.
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/docs/a"]'
        )
        await toggle.click()
      },
      // The catch-all has no generateStaticParams, so the prefetched
      // shell contains the loading boundary, not the page content.
      { includes: 'Loading docs' }
    )

    // Reveal the /docs link. prefetch={false}, so no request fires and
    // the route cache has no entry for /docs.
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/docs"]'
      )
      await toggle.click()
    }, 'no-requests')

    // Record every request issued from here on. If the router
    // mispredicts, it commits a synthetic App Router tree and fetches
    // its segments; if it behaves correctly, it issues a single dynamic
    // request for the unknown route and then hard-navigates.
    const requests: Array<{ url: string; segment: string | null }> = []
    if (capturedPage) {
      capturedPage.on('request', (request: any) => {
        const url: string = request.url()
        if (url.includes('/docs')) {
          requests.push({
            url,
            segment: request.headers()['next-router-segment-prefetch'] ?? null,
          })
        }
      })
    }

    // Watch for any App Router content flashing in, no matter how
    // briefly. A MutationObserver catches commits that resolve faster
    // than a polling interval.
    await browser.eval(`
      window.__sawAppRouterRender = null
      const check = () => {
        if (document.getElementById('docs-loading')) {
          window.__sawAppRouterRender = 'docs-loading'
        } else if (document.getElementById('app-catchall')) {
          window.__sawAppRouterRender = 'app-catchall'
        }
      }
      check()
      const observer = new MutationObserver(check)
      observer.observe(document.body, { childList: true, subtree: true })
    `)

    // Click /docs. The pages route has a 500ms server-side delay, so a
    // transient misprediction cannot be corrected faster than we can
    // observe it.
    const link = await browser.elementByCss('a[href="/docs"]')
    await link.click()

    let sawAppRouterRender: string | null = null
    for (let i = 0; i < 120; i++) {
      const state: { saw: string | null; done: boolean } | null = await browser
        .eval(
          `({
            saw: window.__sawAppRouterRender ?? null,
            done: !!document.getElementById('pages-docs'),
          })`
        )
        // The corrective MPA navigation can destroy the eval context
        // mid-flight; treat that as "nothing observed on this tick".
        .catch(() => null)
      if (state?.saw) {
        sawAppRouterRender = state.saw
        break
      }
      if (state?.done) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    expect(sawAppRouterRender).toBe(null)

    // The navigation must end on the Pages Router page.
    await browser.waitForElementByCss('#pages-docs', 10_000)
    expect(await browser.elementById('pages-docs').text()).toBe(
      'PAGES DOCS PAGE'
    )

    // Diagnostic: surface how the router resolved the navigation. A
    // misprediction manifests as per-segment prefetch requests for the
    // fabricated /docs tree.
    const segmentRequests = requests.filter((r) => r.segment !== null)
    expect(segmentRequests).toEqual([])
  })
})
