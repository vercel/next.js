/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { colorToRgb, getUrlFromBackgroundImage } from 'next-test-utils'

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
  'SCSS Support loader handling ($dependencies)',
  ({ dependencies, nextConfig }) => {
    describe('CSS URL via `file-loader`', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        dependencies,
        nextConfig,
      })

      it('should render the page', async () => {
        const browser = await next.browser('/')
        expect(
          await browser.elementByCss('.red-text').getComputedCss('color')
        ).toBe(colorToRgb('red'))

        const background = await browser
          .elementByCss('.red-text')
          .getComputedCss('background-image')
        expect(background).toMatch(
          /url\(".*\/_next\/static\/media\/dark\..*\.svg"\), url\(".*\/_next\/static\/media\/dark2\..*\.svg"\)/
        )

        const urls = getUrlFromBackgroundImage(background)

        for (const url of urls) {
          const response = await next.fetch(url)
          expect(response.status).toBe(200)
        }
      })
    })
  }
)
