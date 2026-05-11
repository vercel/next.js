import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Page } from 'playwright'

// Reproduces vercel/next.js#93758: when a Pages Router route's chunk takes
// longer than the route-loader timeout (~3.8s) to load, the route loader
// times out and `pageLoader.loadPage()` rejects -- even though the chunk
// eventually succeeds. With Turbopack production builds, the page entrypoint
// registration happens inside chunks that are loaded asynchronously by
// `__turbopack_load_page_chunks__`, which is not awaited by the route loader.
describe('pages-router-route-loader-chunk-delay', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('should not time out when /_next/static chunks load slowly', async () => {
    // Only meaningful in Turbopack production builds: webpack inlines the
    // page entrypoint registration into the loaded script, so the
    // registration is already done when `script.onload` fires.
    if (isNextDev || !isTurbopack) {
      return
    }

    const DELAY_MS = 5000

    let playwrightPage: Page | undefined
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        playwrightPage = page
      },
    })

    await retry(async () => {
      expect(await browser.elementByCss('#home').text()).toBe('home')
    })

    // After the initial page has loaded, delay all /_next/static chunk
    // requests by DELAY_MS. The delay is longer than the route-loader's
    // 3.8s timeout, so without the fix `pageLoader.loadPage('/track')`
    // rejects with "Route did not complete loading: /track" even though
    // the chunks ultimately succeed.
    if (!playwrightPage) throw new Error('playwrightPage was not captured')
    await playwrightPage.route('**/_next/static/**/*.js*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
      await route.continue()
    })

    // Call pageLoader.loadPage directly. This is what `next/link` and
    // `router.push` use under the hood. router.push hides the failure by
    // doing a hard reload on asset errors, but loadPage rejects with
    // "Route did not complete loading: /track" when this bug is present.
    const result: { ok: boolean; message?: string } = await browser.eval<any>(
      async () => {
        try {
          await (window as any).next.router.pageLoader.loadPage('/track')
          return { ok: true }
        } catch (err: any) {
          return { ok: false, message: err?.message ?? String(err) }
        }
      }
    )

    expect(result).toEqual({ ok: true })
  })
})
