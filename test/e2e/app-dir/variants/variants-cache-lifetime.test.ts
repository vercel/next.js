import { isNextStart, nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { retry } from 'next-test-utils'

import { basePath, url } from './base-path'

// Variants are supported with Turbopack only, and enabling them rejects a
// webpack build, which `variants-webpack.test.ts` covers. Deployments require
// the adapter's Variants routing and prerender outputs. Self-hosted dev and
// start do not require an adapter.
// @force-gate turbopack && (!deploy || adapter)
describe('variants with a cache lifetime per combination', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/cache-lifetime',
    // Handed to the build rather than read from `process.env` there, so that
    // a deployed build receives it too: only what goes through here is
    // forwarded to the remote build.
    env: basePath ? { BASE_PATH: basePath } : undefined,
  })

  if (skipped) {
    return
  }

  for (const [pathname, tag] of [
    ['/lifetime/r', 'lifetime-r'],
    ['/', 'lifetime-root'],
  ]) {
    it(`should resolve a variant while revalidating a stale prerender at ${pathname}`, async () => {
      // Expire this route's tagged entries without waiting for their cache
      // lifetime.
      const before = await next.render$(url(pathname), undefined, {
        headers: { cookie: 'theme=dark' },
      })

      expect(before('#theme').text()).toBe('dark')

      const renderedAt = before('#rendered-at').text()
      expect(renderedAt).not.toBe('')

      const revalidateRes = await next.fetch(url(`/revalidate?tag=${tag}`))
      expect(revalidateRes.status).toBe(200)

      // Require a new timestamp to distinguish regenerated content from the
      // stale prerender. The variant value stays the same across revalidation.
      await retry(async () => {
        const after = await next.render$(url(pathname), undefined, {
          headers: { cookie: 'theme=dark' },
        })

        expect(after('#rendered-at').text()).not.toBe('')
        expect(after('#rendered-at').text()).not.toBe(renderedAt)

        expect(after('#theme').text()).toBe('dark')
      })
    })
  }

  it('should resolve the variant the cache lifetime is selected from', async () => {
    const $ = await next.render$(url('/lifetime/a'), undefined, {
      headers: { cookie: 'theme=dark' },
    })

    expect($('#theme').text()).toBe('dark')
  })

  if (isNextStart) {
    it('should give each combination its own cache lifetime', async () => {
      const darkResponse = await next.fetch(url('/lifetime/a'), {
        headers: { cookie: 'theme=dark' },
      })

      expect(darkResponse.headers.get('cache-control')).toContain(
        's-maxage=3600'
      )

      const darkBrowser = await next.browser(url('/lifetime/a'), {
        async beforePageLoad(page: Playwright.Page) {
          await page
            .context()
            .addCookies([{ name: 'theme', value: 'dark', url: next.url }])
        },
      })

      await retry(async () => {
        expect(await darkBrowser.elementByCss('#theme').text()).toBe('dark')
      })

      const lightResponse = await next.fetch(url('/lifetime/a'), {
        headers: { cookie: 'theme=light' },
      })

      expect(lightResponse.headers.get('cache-control')).toContain(
        's-maxage=60'
      )

      const lightBrowser = await next.browser(url('/lifetime/a'), {
        async beforePageLoad(page: Playwright.Page) {
          await page
            .context()
            .addCookies([{ name: 'theme', value: 'light', url: next.url }])
        },
      })

      await retry(async () => {
        expect(await lightBrowser.elementByCss('#theme').text()).toBe('light')
      })
    })
  }
})
