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
  'CSS Module Composes Usage (Basic) ($dependencies)',
  ({ dependencies, nextConfig }) => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies,
      nextConfig,
    })

    it('should render the module', async () => {
      const browser = await next.browser('/')
      expect(
        await browser.elementByCss('#verify-yellow').getComputedCss('color')
      ).toBe(colorToRgb('yellow'))
      expect(
        await browser
          .elementByCss('#verify-yellow')
          .getComputedCss('background-color')
      ).toBe(colorToRgb('blue'))
    })
  }
)
