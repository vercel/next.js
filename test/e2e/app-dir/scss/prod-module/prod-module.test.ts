/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { colorToRgb } from 'next-test-utils'

describe('Has CSS Module in computed styles in Production', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sass: '1.54.0',
    },
  })

  it('should render the page', async () => {
    const browser = await next.browser('/')
    expect(
      await browser.elementByCss('#verify-red').getComputedCss('color')
    ).toBe(colorToRgb('red'))
  })
})
