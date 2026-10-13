import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { retry, waitFor } from 'next-test-utils'

describe('initial hydration after a truncated document', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('reloads once when the initial Flight response is incomplete', async () => {
    let documentRequestCount = 0

    await next.browser('/', {
      async beforePageLoad(page: Playwright.Page) {
        await page.route('**/*', async (route) => {
          const request = route.request()
          const url = new URL(request.url())

          if (
            request.resourceType() !== 'document' ||
            url.pathname !== '/'
          ) {
            await route.continue()
            return
          }

          documentRequestCount++
          const response = await route.fetch()
          const headers = { ...response.headers() }

          // The response body is intentionally truncated. Remove headers that
          // describe the original, complete representation before fulfilling it.
          delete headers['content-length']
          delete headers['transfer-encoding']
          delete headers['content-encoding']

          const body = await response.text()
          await route.fulfill({
            status: response.status(),
            headers,
            body: body.slice(0, Math.floor(body.length * 0.75)),
          })
        })
      },
    })

    // The first incomplete response should trigger one recovery reload.
    await retry(async () => {
      expect(documentRequestCount).toBeGreaterThanOrEqual(2)
    })

    // A consistently truncated response must not trigger an unbounded reload.
    await waitFor(1000)
    expect(documentRequestCount).toBe(2)
  })
})
