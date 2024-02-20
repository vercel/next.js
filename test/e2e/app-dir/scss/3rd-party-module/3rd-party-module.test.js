/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'

function colorToRgb(color) {
  switch (color) {
    case 'blue':
      return 'rgb(0, 0, 255)'
    case 'red':
      return 'rgb(255, 0, 0)'
    case 'green':
      return 'rgb(0, 128, 0)'
    default:
      throw new Error('Unknown color')
  }
}

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
