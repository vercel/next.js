/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { colorToRgb } from 'next-test-utils'

describe('Catch-all Route CSS Module Usage', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sass: '1.54.0',
    },
  })

  it('should render the module', async () => {
    const browser = await next.browser('/post')
    expect(
      await browser.elementByCss('#my-div').getComputedCss('background-color')
    ).toBe(colorToRgb('red'))
  })
})
