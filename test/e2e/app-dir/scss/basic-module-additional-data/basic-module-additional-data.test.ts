/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { colorToRgb } from 'next-test-utils'

const sassOptions = {
  additionalData: `
    $var: red;
  `,
}

describe.each([
  { dependencies: { sass: '1.54.0' }, nextConfig: { sassOptions } },
  {
    dependencies: { 'sass-embedded': '1.75.0' },
    nextConfig: {
      sassOptions: {
        ...sassOptions,
        implementation: 'sass-embedded',
      },
    },
  },
])(
  'Basic Module Additional Data Support ($dependencies)',
  ({ dependencies, nextConfig }) => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies,
      nextConfig,
    })

    it('should render the module', async () => {
      const browser = await next.browser('/')
      expect(
        await browser.elementByCss('#verify-red').getComputedCss('color')
      ).toBe(colorToRgb('red'))
    })
  }
)
