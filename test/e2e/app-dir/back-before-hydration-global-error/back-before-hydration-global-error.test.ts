import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'

// A page that throws while its shell renders is served as the global-error
// document, built by renderToStream's error path. Cache Components rejects
// such a page at build time, so this suite only runs without it.
;(process.env.__NEXT_CACHE_COMPONENTS ? describe.skip : describe)(
  'back navigation before hydration on the global-error document',
  () => {
    const { next } = nextTestSetup({ files: __dirname })

    it('replays a traversal after a reload', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        pushErrorAsConsoleLog: true,
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      await browser.elementById('to-broken').click()
      await browser.elementByCss('#global-error', { waitUntil: false })

      let stalling = true
      const stalled: Array<() => void> = []
      await page.route('**/_next/static/**', async (route) => {
        if (stalling && route.request().resourceType() === 'script') {
          await new Promise<void>((resolve) => stalled.push(resolve))
        }
        await route.continue()
      })
      await browser.refresh({ waitUntil: 'commit' })
      await page.waitForFunction(() => document.readyState !== 'loading')
      await page.evaluate('window.__stayed = true')

      await browser.back({ waitUntil: 'commit' })
      expect(new URL(await browser.url()).pathname).toBe('/')
      stalling = false
      for (const release of stalled) release()

      await retry(async () => {
        expect(
          await browser.eval(
            'document.getElementById("router-url")?.textContent'
          )
        ).toBe('/')
      })
      expect(await browser.eval('window.__routerTransitions')).toEqual([
        'traverse /',
      ])
      expect(await browser.eval('window.__stayed')).toBe(true)
      // The server error and the 500 response are reported as errors.
      const errors = (await browser.log())
        .filter((entry) => entry.source === 'error')
        .map((entry) => entry.message)
      expect(errors).not.toContainEqual(expect.stringContaining('Hydration'))
    })
  }
)
