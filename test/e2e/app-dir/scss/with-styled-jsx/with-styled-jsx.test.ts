/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { colorToRgb } from 'next-test-utils'

describe('Ordering with styled-jsx', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sass: '1.54.0',
    },
  })

  it('should have the correct color (css ordering)', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('.my-text').getComputedCss('color')).toBe(
      colorToRgb('green')
    )
  })
})
