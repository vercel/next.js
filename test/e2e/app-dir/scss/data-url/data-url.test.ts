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
  'SCSS Support loader handling Data Urls ($dependencies)',
  ({ dependencies, nextConfig }) => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies,
      nextConfig,
    })

    it('should render the module', async () => {
      const browser = await next.browser('/')
      const redText = await browser.elementByCss('.red-text')
      expect(await redText.getComputedCss('color')).toBe(colorToRgb('red'))
      expect(await redText.getComputedCss('background-image')).toMatch(
        /url\("data:[^"]+"\)$/
      )
    })
  }
)
