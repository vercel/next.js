/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { colorToRgb } from 'next-test-utils'

describe('Nested @import() Global Support', () => {
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
    expect(
      await browser.elementByCss('.blue-text').getComputedCss('color')
    ).toBe(colorToRgb('blue'))
  })
})
