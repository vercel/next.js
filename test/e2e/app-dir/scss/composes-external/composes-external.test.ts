/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { colorToRgb } from 'next-test-utils'

describe('CSS Module Composes Usage (External)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sass: '1.54.0',
    },
  })

  it('should render the module', async () => {
    const browser = await next.browser('/')
    expect(
      await browser.elementByCss('#verify-yellow').getComputedCss('color')
    ).toBe(colorToRgb('yellow'))
    expect(
      await browser
        .elementByCss('#verify-yellow')
        .getComputedCss('background-color')
    ).toBe(colorToRgb('blue'))
  })
})
