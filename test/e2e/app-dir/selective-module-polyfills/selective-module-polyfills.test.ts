import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('selective-module-polyfills', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      // Chrome 111 lacks URL.canParse (added in 120) but supports Array.prototype.at (added in 92).
      browserslist: ['chrome 111'],
    },
  })

  // Simulate a browser from the browserslist range: remove the builtins before any page script
  // runs, so only the polyfills Next.js ships can bring them back.
  function openWithoutBuiltins(pathname: string) {
    return next.browser(pathname, {
      beforePageLoad: (page) =>
        page.addInitScript(() => {
          Reflect.deleteProperty(URL, 'canParse')
          Reflect.deleteProperty(Array.prototype, 'at')
        }),
    })
  }

  describe.each([
    ['App Router', '/'],
    ['Pages Router', '/pages-router'],
  ])('%s', (_, pathname) => {
    it('should run the needed polyfills before client modules are evaluated', async () => {
      const browser = await openWithoutBuiltins(pathname)

      await retry(async () => {
        expect(await browser.elementByCss('#status').text()).toBe('hydrated')
      })
      expect(
        await browser.elementByCss('#can-parse-at-module-init').text()
      ).toBe('true')
      expect(await browser.elementByCss('#can-parse-works').text()).toBe('true')
      expect(await browser.eval('typeof URL.canParse')).toBe('function')
    })

    // Webpack always includes all polyfills.
    // @force-gate turbopack
    it('should not include polyfills the browserslist does not need', async () => {
      const browser = await openWithoutBuiltins(pathname)

      await retry(async () => {
        expect(await browser.elementByCss('#status').text()).toBe('hydrated')
      })
      expect(
        await browser.elementByCss('#array-at-at-module-init').text()
      ).toBe('false')
    })
  })
})
