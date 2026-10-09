import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Page } from 'playwright'

// Reproduces vercel/next.js#93758: when a Pages Router route's chunks take
// longer than the route-loader timeout (~3.8s) to load, the route loader
// times out and `pageLoader.loadPage()` rejects -- even though the chunks
// eventually succeed. In Turbopack production builds, registering a page
// starts loading its chunks asynchronously. The route loader must wait for
// that work before starting the entrypoint timeout.
//
// Without the fix the test fails with:
//   Route did not complete loading: /track
//
// Webpack production registers the page entrypoint from the loaded script,
// so `script.onload` already implies registration. Dev mode has its own
// deadline gate (`devBuildPromise`).
// @force-gate turbopack && start
describe('pages-router-route-loader-chunk-delay', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function loadTrackWithDelayedAssets(
    pattern: string
  ): Promise<{ ok: boolean; message?: string }> {
    const delayMs = 5000

    let playwrightPage: Page | undefined
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        playwrightPage = page
      },
    })

    await retry(async () => {
      expect(await browser.elementByCss('#home').text()).toBe('home')
    })

    if (!playwrightPage) throw new Error('playwrightPage was not captured')
    await playwrightPage.route(pattern, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      await route.continue()
    })

    // `router.push` masks this failure by falling back to a hard navigation,
    // so call the underlying page loader directly.
    return browser.eval<any>(async () => {
      try {
        await (window as any).next.router.pageLoader.loadPage('/track')
        return { ok: true }
      } catch (err: any) {
        return { ok: false, message: err?.message ?? String(err) }
      }
    })
  }

  it('should not time out when JavaScript chunks load slowly', async () => {
    expect(
      await loadTrackWithDelayedAssets('**/_next/static/**/*.js*')
    ).toEqual({ ok: true })
  })

  it('should time out when CSS chunks load slowly', async () => {
    expect(
      await loadTrackWithDelayedAssets('**/_next/static/**/*.css*')
    ).toEqual({
      ok: false,
      message: 'Route did not complete loading: /track',
    })
  })
})
