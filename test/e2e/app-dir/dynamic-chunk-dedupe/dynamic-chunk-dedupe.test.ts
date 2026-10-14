import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('dynamic-chunk-dedupe', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
    // Keep the `deploymentId` from next.config.ts in effect (instead of the
    // test harness's immutable assets) so chunk URLs carry `?dpl=`.
    disableAutoSkewProtection: true,
  })

  it('should load every dynamic chunk exactly once', async () => {
    const chunkRequests: string[] = []
    const pageErrors: Error[] = []
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        page.on('request', (request) => {
          const url = new URL(request.url())
          if (
            url.pathname.includes('/_next/static/') &&
            /\.(js|css)$/.test(url.pathname)
          ) {
            chunkRequests.push(url.pathname + url.search)
          }
        })
        page.on('pageerror', (error: Error) => {
          pageErrors.push(error)
        })
      },
    })

    await retry(async () => {
      expect(await browser.elementByCss('#widget-a').text()).toBe('widget a')
      expect(await browser.elementByCss('#widget-b').text()).toBe('widget b')
      expect(await browser.elementByCss('#widget-c').text()).toBe('widget c')
      expect(
        await browser.elementByCss('#styled-server').getComputedCss('color')
      ).toBe('rgb(0, 128, 0)')
      expect(
        await browser.elementByCss('#styled-client').getComputedCss('color')
      ).toBe('rgb(0, 0, 255)')
    })

    expect(pageErrors).toEqual([])

    // The chunk loader must recognize the `<script>` / `<link>` tags already in
    // the DOM (including their query suffix) instead of requesting them again.
    const counts = new Map<string, number>()
    for (const request of chunkRequests) {
      const pathname = request.split('?')[0]
      counts.set(pathname, (counts.get(pathname) ?? 0) + 1)
    }
    const duplicates = [...counts].filter(([, count]) => count > 1)
    expect(duplicates).toEqual([])

    // A duplicate tag may be served from the memory cache without a new
    // request, so also check the DOM directly.
    const duplicateTags = await browser.eval(() => {
      const seen = new Map<string, number>()
      const elements = document.querySelectorAll(
        'script[src*="/_next/static/"], link[rel=stylesheet][href*="/_next/static/"]'
      )
      for (const element of Array.from(elements)) {
        const url = element.getAttribute('src') ?? element.getAttribute('href')
        const key = `${element.tagName} ${url!.split('?')[0]}`
        seen.set(key, (seen.get(key) ?? 0) + 1)
      }
      return [...seen].filter(([, count]) => count > 1)
    })
    expect(duplicateTags).toEqual([])

    if (!isNextDeploy) {
      // Deployments set their own deployment id.
      expect(
        chunkRequests.some((url) => url.includes('dpl=dynamic-chunk-dedupe'))
      ).toBe(true)
    }
  })
})
