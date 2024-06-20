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
  'SCSS Support loader handling External imports ($dependencies)',
  ({ dependencies, nextConfig }) => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies,
      nextConfig,
    })
    it(`should include font on the page`, async () => {
      const browser = await next.browser('/')
      const result = await browser.eval(async function () {
        return document.fonts.ready.then((fonts) => {
          const includedFonts = []
          for (const font of fonts.values()) {
            includedFonts.push(font.family)
          }
          return includedFonts
        })
      })
      expect(result).toInclude('Poppins')
    })
  }
)
