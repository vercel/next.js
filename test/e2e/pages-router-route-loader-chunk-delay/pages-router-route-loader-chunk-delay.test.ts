import { nextTestSetup, isNextDev } from 'e2e-utils'
import { retry, shouldUseTurbopack } from 'next-test-utils'
import type { Page } from 'playwright'

// Reproduces vercel/next.js#93758: when a Pages Router route's chunks take
// longer than the route-loader timeout (~3.8s) to load, the route loader
// times out and `pageLoader.loadPage()` rejects -- even though the chunks
// eventually succeed. In Turbopack production builds the page-loader script
// is a tiny stub that asynchronously requests the actual page chunks via
// `__turbopack_load_page_chunks__`, which the route loader did not await.
//
// Without the fix the test fails with:
//   Route did not complete loading: /track
//
// The combination of i18n / `assetPrefix` / `deploymentId` in the original
// reproduction is incidental: any sufficiently slow chunk download triggers
// the bug. This fixture uses Playwright's request interception to slow down
// /_next/static chunk responses.
//
// Webpack production inlines the page-entrypoint registration into the
// loaded script, so `script.onload` already implies the entrypoint is
// registered; the bug doesn't apply. Dev mode has its own deadline gate
// (devBuildPromise). The test is therefore restricted to turbopack `start`.
const isTurbopackProd = !isNextDev && shouldUseTurbopack()
const describeMaybe = isTurbopackProd ? describe : describe.skip

describeMaybe('pages-router-route-loader-chunk-delay', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not time out when /_next/static chunks load slowly', async () => {
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
    // requests by DELAY_MS. The delay exceeds the route-loader's 3.8s
    // timeout, so without the fix `pageLoader.loadPage('/track')` rejects
    // with "Route did not complete loading: /track" even though the chunks
    // ultimately succeed.
    if (!playwrightPage) throw new Error('playwrightPage was not captured')
    await playwrightPage.route('**/_next/static/**/*.js*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
      await route.continue()
    })

    // Call pageLoader.loadPage directly. `router.push` would also hit this
    // path, but it then masks the failure by triggering a hard reload on
    // asset errors, which is harder to observe in a test.
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
