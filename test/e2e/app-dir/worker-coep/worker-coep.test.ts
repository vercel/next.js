import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Page, Response } from 'playwright'

describe('worker-coep', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should load a web worker when the document has COEP: require-corp', async () => {
    const workerResponses: Array<{ url: string; corp: string | null }> = []

    const browser = await next.browser('/', {
      beforePageLoad(page: Page) {
        page.on('response', (response: Response) => {
          const url = response.url()
          if (url.includes('/_next/static/') && /worker/i.test(url)) {
            workerResponses.push({
              url,
              corp: response.headers()['cross-origin-resource-policy'] ?? null,
            })
          }
        })
      },
    })

    await retry(async () => {
      expect(await browser.elementByCss('#worker-state').text()).toBe('hello')
    })

    expect(workerResponses.length).toBeGreaterThan(0)
    for (const { corp } of workerResponses) {
      expect(corp).toBe('same-origin')
    }
  })
})
