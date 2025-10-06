/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'

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
  'Good CSS Import from node_modules ($dependencies)',
  ({ dependencies, nextConfig }) => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {
        ...dependencies,
        nprogress: '0.2.0',
      },
      nextConfig,
    })

    it('should render the page', async () => {
      const browser = await next.browser('/')
      expect(
        await browser
          .elementByCss('#nprogress .bar')
          .getComputedCss('background-color')
      ).toBe('rgb(34, 153, 221)')
    })
  }
)
