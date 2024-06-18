/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { colorToRgb } from 'next-test-utils'

describe('Valid Nested CSS Module Usage from within node_modules', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sass: '1.54.0',
    },
  })

  it('should render the page', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#other2').getComputedCss('color')).toBe(
      colorToRgb('red')
    )
    expect(await browser.elementByCss('#other3').getComputedCss('color')).toBe(
      colorToRgb('black')
    )
    expect(
      await browser.elementByCss('#subclass').getComputedCss('color')
    ).toBe(colorToRgb('yellow'))
    expect(
      await browser.elementByCss('#subclass').getComputedCss('background-color')
    ).toBe(colorToRgb('blue'))
  })
})
