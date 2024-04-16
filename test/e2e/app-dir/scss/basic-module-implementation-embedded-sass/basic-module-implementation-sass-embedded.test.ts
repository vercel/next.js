/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { colorToRgb } from 'next-test-utils'

describe('Basic Module Prepend Data Support', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'sass-embedded': '1.75.0',
    },
  })

  it('should render the module', async () => {
    const browser = await next.browser('/')
    expect(
      await browser.elementByCss('#verify-red').getComputedCss('color')
    ).toBe(colorToRgb('red'))
  })
})
