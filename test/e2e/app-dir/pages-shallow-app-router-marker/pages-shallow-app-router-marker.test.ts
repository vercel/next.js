import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('pages router - shallow navigation with a stale app router marker', () => {
  const { next, isNextDev } = nextTestSetup({ files: __dirname })

  // `router.prefetch()` is a no-op in development, so the client router filter
  // marker is only ever written by production builds.
  ;(isNextDev ? describe.skip : describe)('production mode', () => {
    it('should keep the page props and state after a prefetch marked the current route', async () => {
      const browser = await next.browser('/blog/first')
      expect(await browser.elementById('slug').text()).toBe('first')
      expect(await browser.elementById('tab').text()).toBe('a')

      await browser.elementById('counter').click()
      await retry(async () => {
        expect(await browser.elementById('counter').text()).toBe('1')
      })

      // `href` is the route of this page, `as` is an app route. Without the
      // fix the prefetch replaces the cached route info of this page with the
      // `{ __appRouter: true }` marker.
      await browser.elementById('prefetch-new').click()
      await retry(async () => {
        expect(await browser.elementById('prefetch-state').text()).toBe('done')
      })

      // a normal shallow link on the same page reads the cache entry
      await browser.elementById('tab-b').click()
      await retry(async () => {
        expect(await browser.elementById('tab').text()).toBe('b')
      })

      // the props from getServerSideProps and the client state must survive
      expect(await browser.elementById('slug').text()).toBe('first')
      expect(await browser.elementById('counter').text()).toBe('1')
      expect(await browser.eval('location.search')).toBe('?tab=b')
    })
  })
})
