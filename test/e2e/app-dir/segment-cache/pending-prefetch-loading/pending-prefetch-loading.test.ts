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

          const isPrefetch =
            headers['next-router-prefetch'] !== undefined ||
            headers['next-router-segment-prefetch'] !== undefined
          if (!isPrefetch) {
            navigationStarted = true
            await route.continue()
            return
          }

          // Keep the prefetch in flight until navigation has started. Its
          // response has the loading boundary and no page data.
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

    // Reveal the link. Its prefetch stays in flight until this test releases it.
    await browser.elementByCss('input[data-link-accordion="/item"]').click()
    await retry(async () => {
      expect(heldPrefetches.length).toBeGreaterThan(0)
    })

    // Start navigation while that prefetch is still pending. The navigation
    // response streams immediately, but the page itself waits 1500ms, so the
    // prefetch can resolve before the page data arrives. createRouterAct
    // cannot separate those two responses.
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
