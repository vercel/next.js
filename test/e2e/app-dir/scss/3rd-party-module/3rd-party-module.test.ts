/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { colorToRgb } from 'next-test-utils'

describe.each([
  { dependencies: { sass: '1.54.0' }, nextConfig: undefined },
  {
    dependencies: { 'sass-embedded': '1.75.0' },
    nextConfig: {
      sassOptions: {
        implementation: 'sass-embedded',
      },
    },
  },
])(
  '3rd Party CSS Module Support ($dependencies)',
  ({ dependencies, nextConfig }) => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies,
      nextConfig,
    })

    it('should render the module', async () => {
      const browser = await next.browser('/')
      // Bar
      expect(
        await browser
          .elementByCss('#verify-div .bar')
          .getComputedCss('background-color')
      ).toBe(colorToRgb('blue'))

      // Baz
      expect(
        await browser
          .elementByCss('#verify-div .baz')
          .getComputedCss('background-color')
      ).toBe(colorToRgb('blue'))

      // Lol
      expect(
        await browser
          .elementByCss('#verify-div .lol')
          .getComputedCss('background-color')
      ).toBe(colorToRgb('red'))

      // Lel
      expect(
        await browser
          .elementByCss('#verify-div .lel')
          .getComputedCss('background-color')
      ).toBe(colorToRgb('green'))
    })
  }
)
