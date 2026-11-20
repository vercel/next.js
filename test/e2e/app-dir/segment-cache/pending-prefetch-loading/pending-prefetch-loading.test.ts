import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Page, Route } from 'playwright'

describe('navigation during a pending prefetch', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  // Dev does not prefetch, so this race cannot happen there.
  if (isNextDev) {
    it('does not prefetch in development', () => {})
    return
  }

  it('shows loading.tsx when the prefetch resolves with no page data', async () => {
    type HeldPrefetch = { url: string; release: () => void }
    const heldPrefetches: HeldPrefetch[] = []
    let navigationStarted = false
    let page!: Page

    const browser = await next.browser('/', {
      beforePageLoad(loadedPage: Page) {
        page = loadedPage
        loadedPage.route('**/*', async (route: Route) => {
          const request = route.request()
          const headers = request.headers()
          const url = new URL(request.url())
          if (headers['rsc'] === undefined || url.pathname !== '/item') {
            await route.continue()
            return
          }

          const segmentPrefetch = headers['next-router-segment-prefetch']
          // On a cold visit the first request is the route tree (`/_tree`),
          // not a page segment. Holding it lets the click start navigation
          // before any page-segment prefetch exists, so the pending-entry
          // race never happens. Let the tree through, then hold the prefetch
          // that can resolve without page data.
          if (segmentPrefetch === '/_tree') {
            await route.continue()
            return
          }

          const isPagePrefetch =
            // Legacy loading-boundary prefetch: `next-router-prefetch` and
            // the state tree, with no segment header. This is the response
            // that carries loading.tsx and omits the page segment.
            (segmentPrefetch === undefined &&
              headers['next-router-prefetch'] !== undefined) ||
            // Per-segment prefetch of the page itself.
            (segmentPrefetch !== undefined &&
              segmentPrefetch.endsWith('__PAGE__'))
          if (!isPagePrefetch) {
            // A navigation has neither prefetch header. Other segment
            // prefetches (layout, head) are not the pending page entry.
            if (
              headers['next-router-prefetch'] === undefined &&
              segmentPrefetch === undefined
            ) {
              navigationStarted = true
            }
            await route.continue()
            return
          }

          // Keep the page prefetch in flight until navigation has started.
          // Its response has the loading boundary and no page data.
          let release!: () => void
          const released = new Promise<void>((resolve) => {
            release = resolve
          })
          heldPrefetches.push({ url: url.toString(), release })
          const response = await route.fetch()
          await released
          await route.fulfill({ response })
        })
      },
    })

    await page.evaluate(() => {
      const frames: Array<{ path: string; text: string }> = []
      ;(window as unknown as { __frames: typeof frames }).__frames = frames
      const sample = () => {
        frames.push({
          path: location.pathname,
          text: document.body.innerText.replace(/\s+/g, ' ').trim(),
        })
        requestAnimationFrame(sample)
      }
      sample()
    })

    // Reveal the link. The route tree is delivered immediately; the page
    // prefetch stays in flight until this test releases it.
    await browser.elementByCss('input[data-link-accordion="/item"]').click()
    await retry(async () => {
      expect(heldPrefetches.length).toBeGreaterThan(0)
    })

    // Start navigation only after that page prefetch exists and is still
    // pending. The navigation response streams immediately, but the page
    // itself waits 1500ms, so the prefetch can resolve before the page data
    // arrives. createRouterAct cannot separate those two responses.
    await browser.elementByCss('a[href="/item"]').click()
    await retry(async () => {
      expect(navigationStarted).toBe(true)
    })

    for (const prefetch of heldPrefetches) {
      prefetch.release()
    }

    let frames: Array<{ path: string; text: string }> = []
    try {
      await retry(async () => {
        frames = await page.evaluate(
          () =>
            (
              window as unknown as {
                __frames: Array<{ path: string; text: string }>
              }
            ).__frames
        )
        expect(frames.some((frame) => frame.text.includes('Item page'))).toBe(
          true
        )
      }, 20000)
    } catch (error) {
      throw new Error(
        `Navigation did not reach the page.\nurl=${page.url()}\nprefetches=${heldPrefetches.length}\nnavigationStarted=${navigationStarted}\nframes=${JSON.stringify(frames.slice(-12))}\n${error}`
      )
    }
    const itemFrames = frames.filter((frame) => frame.path === '/item')
    const sawLoading = itemFrames.some((frame) =>
      frame.text.includes('Loading item')
    )
    const blank = itemFrames.filter(
      (frame) =>
        !frame.text.includes('Loading item') &&
        !frame.text.includes('Item page')
    )

    expect({
      sawLoading,
      blank: blank.map((frame) => frame.text),
    }).toEqual({ sawLoading: true, blank: [] })
  })
})
