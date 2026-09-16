import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('pages router - prefetch of an app route that starts with the basePath', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  // `router.prefetch()` is a no-op in development, so the client router filter
  // marker is only ever written by production builds.
  ;(isNextDev ? describe.skip : describe)('production mode', () => {
    async function hoverAppLink(
      browser: Awaited<ReturnType<typeof next.browser>>
    ) {
      await browser.eval('window.beforeNav = 1')
      await browser.elementById('app-link').moveTo()

      await retry(async () => {
        expect(
          await browser.eval(
            "window.next.router.components['/docs']?.__appRouter"
          )
        ).toBe(true)
      })
    }

    it('should hard navigate to the app route when the link is clicked', async () => {
      const browser = await next.browser('/docs')
      await hoverAppLink(browser)

      await browser.elementById('app-link').click()
      await browser.waitForElementByCss('#app-page')

      expect(await browser.eval('window.beforeNav')).toBeUndefined()
      expect(await browser.eval('location.pathname')).toBe('/docs/docs')
    })

    it('should keep shallow navigation working on the index page after prefetching the link', async () => {
      const browser = await next.browser('/docs')
      await hoverAppLink(browser)

      await browser.elementById('tab-b').click()
      await retry(async () => {
        expect(await browser.elementById('tab').text()).toBe('b')
      })

      // a hard navigation would have reset the flag
      expect(await browser.eval('window.beforeNav')).toBe(1)
      expect(await browser.eval('location.pathname')).toBe('/docs')
      expect(await browser.eval('location.search')).toBe('?tab=b')
    })
  })
})
