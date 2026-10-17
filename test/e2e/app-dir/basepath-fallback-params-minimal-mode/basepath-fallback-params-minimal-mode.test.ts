import { isNextStart, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'

// Regression test for the `basepath-fallback-params` client-navigation failure
// on the legacy (non-adapter) Vercel deploy target, where `useParams()`
// rendered an opaque `%%drp:itemId:<hash>%%` placeholder.
//
// Evidence from the failing deployment:
// - A full navigation to `/dashboard/items/expected-id` was served from
//   `x-matched-path: /items/[itemId].rsc`, and its router tree had
//   `k: "%%drp:itemId:<hash>%%"`.
// - The fallback shell has no postponed state. For such a shell, the legacy
//   builder configures the navigation data route with `allowQuery: []`.
//
// When deployed, this performs the navigations for real. With `next start`, it
// emulates that legacy serving path in minimal mode: it renders the param-free
// route-template request and serves the result to real concrete client
// navigations. The platform-to-function request is an inference from the
// builder configuration, not a captured request.
//
// The client resolves the response's opaque placeholder keys from the
// navigated URL, so one shared response serves every param value.
describe('basepath-fallback-params-minimal-mode', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: isNextStart
      ? {
          // Keep `x-matched-path`, which the platform sets, on the request.
          NEXT_PRIVATE_TEST_HEADERS: '1',
          NEXT_PRIVATE_MINIMAL_MODE: '1',
        }
      : {},
  })

  if (isNextStart) {
    it('does not generate postponed state for the fallback shell', async () => {
      const metadata = await next.readJSON(
        '.next/server/app/items/[itemId].meta'
      )
      expect(metadata.postponed).toBeUndefined()
    })
  }

  it('renders the concrete param after navigations without prefetching', async () => {
    let sharedResponseCount = 0
    const browser = await next.browser('/dashboard', {
      async beforePageLoad(page: Playwright.Page) {
        if (!isNextStart) {
          return
        }

        await page.route('**/dashboard/items/*?**', async (route) => {
          const headers = route.request().headers()
          if (headers.rsc !== '1' || headers['next-router-prefetch']) {
            await route.continue()
            return
          }

          // Serve the shared fallback data route the legacy builder selects:
          // the param is stripped, so the function renders the route template.
          sharedResponseCount++
          const response = await next.fetch('/dashboard/items/[itemId]', {
            headers: { 'x-matched-path': '/items/[itemId]', rsc: '1' },
          })
          const responseHeaders = Object.fromEntries(response.headers)
          delete responseHeaders['content-encoding']
          delete responseHeaders['content-length']
          await route.fulfill({
            status: response.status,
            headers: responseHeaders,
            body: Buffer.from(await response.arrayBuffer()),
          })
        })
      },
    })

    await browser.elementByCss('a').click()
    expect(await browser.elementById('item-id').text()).toBe('expected-id')

    // A second param value is served from the same shared response. The value
    // stays URL-encoded, like after any client navigation in this route.
    await browser.elementById('next-item').click()
    await retry(async () => {
      expect(await browser.elementById('item-id').text()).toBe('second%20id')
    })

    expect(sharedResponseCount).toBe(isNextStart ? 2 : 0)
  })
})
