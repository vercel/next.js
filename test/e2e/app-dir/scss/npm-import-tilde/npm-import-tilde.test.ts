/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'

describe('Good CSS Import from node_modules with tilde', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sass: '1.54.0',
      nprogress: '0.2.0',
    },
  })

  it('should render the page', async () => {
    const browser = await next.browser('/')
    expect(
      await browser
        .elementByCss('#nprogress .bar')
        .getComputedCss('background-color')
    ).toBe('rgb(34, 153, 221)')
  })
})
