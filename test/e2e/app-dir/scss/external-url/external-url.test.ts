/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'

describe('SCSS Support loader handling External imports', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sass: '1.54.0',
    },
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
})
