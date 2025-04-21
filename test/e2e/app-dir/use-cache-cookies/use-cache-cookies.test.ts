import { nextTestSetup } from 'e2e-utils'
import path from 'path'
import expect from 'expect'

describe('use-cache-cookies', () => {
  describe('with dynamicIO', () => {
    const { next, skipped } = nextTestSetup({
      files: path.join(__dirname, 'fixtures', 'dynamic-io'),
      skipDeployment: true, // TODO: Activate later.
    })

    if (skipped) {
      return
    }

    it('should make a cached function that accesses cookies dynamic', async () => {
      const browser = await next.browser('/', {
        waitUntil: 'commit',
        waitHydration: false,
      })

      // The loading boundary is expected to be shown while the page is loading,
      // and the dynamic cache function is evaluated. We're using `browser.eval`
      // here to assert on the document as early as possible. The other
      // Playwright APIs (incl. `page.$`) add a delay that sometimes leads to
      // missing the ephemeral loading element.
      expect(
        await browser.eval('document.getElementById("loading")')
      ).toBeDefined()

      const cachedInLayout = await browser
        .elementById('cached-in-layout')
        .text()

      expect(await browser.elementById('login-status').text()).toBe(
        'logged out'
      )

      await browser.refresh({ waitUntil: 'commit' })

      // The login status is now cached, so no loading boundary is expected.
      expect(
        await browser.eval('document.getElementById("loading")')
      ).toBeNull()

      expect(await browser.elementById('cached-in-layout').text()).toBe(
        cachedInLayout
      )

      expect(await browser.elementById('login-status').text()).toBe(
        'logged out'
      )
    })

    // TODO: Assert that data is actually cached for both variants, logged-in
    // and logged-out.
    it('should include used cookies in the cache key', async () => {
      const browser = await next.browser('/')

      expect(await browser.elementById('login-status').text()).toBe(
        'logged out'
      )

      await browser.addCookie({ name: 'isLoggedIn', value: 'true' })
      await browser.refresh()

      expect(await browser.elementById('login-status').text()).toBe('logged in')
    })
  })
})
