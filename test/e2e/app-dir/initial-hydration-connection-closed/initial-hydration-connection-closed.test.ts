import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { retry, waitFor } from 'next-test-utils'

describe('initial hydration after a truncated document', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function routeDocumentThroughTruncation(
    page: Playwright.Page,
    options: { truncateEveryResponse: boolean }
  ) {
    let documentRequestCount = 0

    await page.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())

      if (request.resourceType() !== 'document' || url.pathname !== '/') {
        await route.continue()
        return
      }

      documentRequestCount++
      if (!options.truncateEveryResponse && documentRequestCount > 1) {
        await route.continue()
        return
      }

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

    return () => documentRequestCount
  }

  it('reloads and hydrates when the recovery response is complete', async () => {
    let getDocumentRequestCount = () => 0

    const browser = await next.browser('/', {
      async beforePageLoad(page: Playwright.Page) {
        getDocumentRequestCount = await routeDocumentThroughTruncation(page, {
          truncateEveryResponse: false,
        })
      },
    })

    await retry(async () => {
      expect(getDocumentRequestCount()).toBe(2)
      expect(
        await browser.eval('document.documentElement.dataset.hydrated')
      ).toBe('true')
    })

    await browser.elementByCss('#counter').click()
    await retry(async () => {
      expect(await browser.elementByCss('#counter').text()).toBe('Count: 1')
    })
    await browser.close()
  })

  it('does not loop if every initial document response is incomplete', async () => {
    let getDocumentRequestCount = () => 0

    const browser = await next.browser('/', {
      async beforePageLoad(page: Playwright.Page) {
        getDocumentRequestCount = await routeDocumentThroughTruncation(page, {
          truncateEveryResponse: true,
        })
      },
    })

    await retry(async () => {
      expect(getDocumentRequestCount()).toBeGreaterThanOrEqual(2)
    })

    // Give a possible accidental reload loop time to request another document.
    await waitFor(1000)
    expect(getDocumentRequestCount()).toBe(2)
    await browser.close()
  })
})
