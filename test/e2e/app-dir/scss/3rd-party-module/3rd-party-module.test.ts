/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { colorToRgb } from 'next-test-utils'

describe('3rd Party CSS Module Support', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sass: '1.54.0',
    },
  })

  it('should render the module', async () => {
    const browser = await next.browser('/')
    // Bar
    expect(
      await browser
        .elementByCss('#verify-div .bar')
        .getComputedCss('background-color')
    ).toBe(colorToRgb('blue'))

    // Baz
    expect(
      await browser
        .elementByCss('#verify-div .baz')
        .getComputedCss('background-color')
    ).toBe(colorToRgb('blue'))

    // Lol
    expect(
      await browser
        .elementByCss('#verify-div .lol')
        .getComputedCss('background-color')
    ).toBe(colorToRgb('red'))

    // Lel
    expect(
      await browser
        .elementByCss('#verify-div .lel')
        .getComputedCss('background-color')
    ).toBe(colorToRgb('green'))
  })
})
