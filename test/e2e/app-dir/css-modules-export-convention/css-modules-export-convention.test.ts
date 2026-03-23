import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('css-modules-export-convention', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  // This feature is Turbopack-only. Webpack uses its own css-loader convention.
  ;(isTurbopack ? describe : describe.skip)('turbopack', () => {
    it('should export camelCased keys with camelCaseOnly convention', async () => {
      const browser = await next.browser('/')

      await retry(async () => {
        const keys = await browser.elementByCss('#keys').text()
        // With camelCaseOnly: kebab-case and underscore names are camelCased,
        // "simple" stays the same since it has no delimiters.
        expect(keys).toBe('mainContent,navBar,simple,withUnderscore')
      })
    })

    it('should apply styles via camelCased class names', async () => {
      const browser = await next.browser('/')

      await retry(async () => {
        const mainColor = await browser
          .elementByCss('#main')
          .getComputedCss('color')
        // red = rgb(255, 0, 0)
        expect(mainColor).toBe('rgb(255, 0, 0)')
      })

      const navColor = await browser
        .elementByCss('#nav')
        .getComputedCss('color')
      // blue = rgb(0, 0, 255)
      expect(navColor).toBe('rgb(0, 0, 255)')

      const simpleColor = await browser
        .elementByCss('#simple')
        .getComputedCss('color')
      // green = rgb(0, 128, 0)
      expect(simpleColor).toBe('rgb(0, 128, 0)')

      const underscoreColor = await browser
        .elementByCss('#underscore')
        .getComputedCss('color')
      // orange = rgb(255, 165, 0)
      expect(underscoreColor).toBe('rgb(255, 165, 0)')
    })
  })
})
