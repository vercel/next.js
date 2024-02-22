/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { colorToRgb } from 'next-test-utils'

describe('Dynamic Route CSS Module Usage', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sass: '1.54.0',
    },
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('should apply styles correctly', async () => {
      const browser = await next.browser('/post-1')

      const background = await browser
        .elementByCss('#my-div')
        .getComputedCss('background-color')

      expect(background).toMatch(colorToRgb('red'))
    })
  })
})
