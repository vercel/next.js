/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { colorToRgb, getUrlFromBackgroundImage } from 'next-test-utils'

// TODO: Skipped as this test should set up the server to handle assetPrefix which it currently does not do.
describe.skip('SCSS Support loader handling', () => {
  describe('CSS URL via `file-loader` and asset prefix (1)', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {
        sass: '1.54.0',
      },
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
        /url\(".*\/foo\/_next\/static\/media\/dark\..*\.svg"\), url\(".*\/foo\/_next\/static\/media\/dark2\..*\.svg"\)/
      )

      const urls = getUrlFromBackgroundImage(background)

      for (const url of urls) {
        const response = await next.fetch(url)
        expect(response.status).toBe(200)
      }
    })
  })
})
