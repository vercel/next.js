/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { colorToRgb } from 'next-test-utils'

describe('SCSS Support loader handling Preprocessor loader order', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sass: '1.54.0',
    },
  })
  it('should render the module', async () => {
    const browser = await next.browser('/')
    expect(
      await browser.elementByCss('.red-text').getComputedCss('color')
    ).toBe(colorToRgb('red'))
  })
})
