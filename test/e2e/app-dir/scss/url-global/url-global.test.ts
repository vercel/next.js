/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { colorToRgb } from 'next-test-utils'

function getUrlFromBackgroundImage(backgroundImage: string) {
  const matches = backgroundImage.match(/url\("[^)]+"\)/g).map((match) => {
    // Extract the URL part from each match. The match includes 'url("' and '"")', so we remove those.
    return match.slice(5, -2)
  })

  return matches
}

describe('SCSS Support loader handling', () => {
  describe('CSS URL via `file-loader`', () => {
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
        /url\(".*\/_next\/static\/media\/dark\..*\.svg"\), url\(".*\/_next\/static\/media\/dark2\..*\.svg"\)/
      )

      const urls = getUrlFromBackgroundImage(background)

      for (const url of urls) {
        const response = await next.fetch(url)
        expect(response.status).toBe(200)
      }
    })
  })
})
