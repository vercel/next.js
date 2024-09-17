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
  'Dynamic Route CSS Module Usage ($dependencies)',
  ({ dependencies, nextConfig }) => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies,
      nextConfig,
    })
    it('should apply styles correctly', async () => {
      const browser = await next.browser('/post-1')

      const background = await browser
        .elementByCss('#my-div')
        .getComputedCss('background-color')

      expect(background).toMatch(colorToRgb('red'))
    })
  }
)
