import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('pages router - prefetch marker keeps the effective locale', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  // `router.prefetch()` is a no-op in development, so the client router filter
  // marker is only ever written by production builds.
  ;(isNextDev ? describe.skip : describe)('production mode', () => {
    it('should keep the English navigation client-side after prefetching the French-only redirect', async () => {
      const browser = await next.browser('/')
      await browser.eval('window.beforeNav = 1')
      await browser.elementById('fr-legacy-link').moveTo()

      // wait until the prefetch has matched `/fr/legacy` and stored its marker
      await retry(async () => {
        expect(
          await browser.eval(
            "window.next.router.components['/fr/legacy']?.__appRouter"
          )
        ).toBe(true)
      })

      await browser.elementById('en-legacy-link').click()
      await browser.waitForElementByCss('#legacy-page')

      // a hard navigation would have reset the flag
      expect(await browser.eval('window.beforeNav')).toBe(1)
      expect(await browser.eval('location.pathname')).toBe('/legacy')
    })
  })
})
