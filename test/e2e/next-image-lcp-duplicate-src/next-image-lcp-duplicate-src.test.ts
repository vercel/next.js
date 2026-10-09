import { nextTestSetup, isNextDev } from 'e2e-utils'
import { retry } from 'next-test-utils'

// The LCP warning is only emitted in development.
;(isNextDev ? describe : describe.skip)(
  'next/image LCP warning with a duplicated src',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    async function loadPageAndWaitForLcp(path: string) {
      const browser = await next.browser(path)
      await retry(async () => {
        expect(
          await browser.eval(`document.getElementById('eager').naturalWidth`)
        ).toBeGreaterThan(0)
      })
      await retry(async () => {
        expect(await browser.eval(`window.__lcpImageId`)).toBe('eager')
      })
      // Give the warning (emitted from the LCP PerformanceObserver) time to
      // reach the console.
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const logs = (await browser.log()).map((log) => log.message).join('\n')
      return {
        browser,
        logs,
        lcpLoading: await browser.eval(`window.__lcpImageLoading`),
      }
    }

    it('does not warn when the painted LCP element is eager', async () => {
      const { logs, lcpLoading } = await loadPageAndWaitForLcp('/')

      // The element the browser painted as LCP already opts out of lazy loading.
      expect(lcpLoading).toBe('eager')
      expect(logs).not.toMatch(
        /Image with src (.*)slow-image(.*) was detected as the Largest Contentful Paint \(LCP\). Please add the `loading="eager"` property/
      )
    })

    it('does not warn when the duplicated image is also eager', async () => {
      const { logs, lcpLoading } = await loadPageAndWaitForLcp('/both-eager')

      expect(lcpLoading).toBe('eager')
      expect(logs).not.toMatch(
        /was detected as the Largest Contentful Paint \(LCP\)/
      )
    })
  }
)
