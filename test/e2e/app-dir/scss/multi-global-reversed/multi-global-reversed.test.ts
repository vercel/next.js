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
  '(SCSS) Multi Global Support (reversed) ($dependencies)',
  ({ dependencies, nextConfig }) => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies,
      nextConfig,
    })

    it('should render the page', async () => {
      const browser = await next.browser('/')
      expect(
        await browser.elementByCss('#verify-blue').getComputedCss('color')
      ).toBe(colorToRgb('blue'))
    })
  }
)
