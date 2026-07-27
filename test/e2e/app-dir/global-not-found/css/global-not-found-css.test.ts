import { nextTestSetup } from 'e2e-utils'

describe('global-not-found - css', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should include css for global-not-found properly', async () => {
    const browser = await next.browser('/does-not-exist')

    // This css import is shared with `/` route's layout
    const textColorOrange = await browser
      .elementByCss('.orange-text')
      .getComputedCss('color')
    expect(textColorOrange).toBe('rgb(255, 165, 0)')

    // This css import is only used in the global-not-found convention
    const textColorRed = await browser
      .elementByCss('.blue-text')
      .getComputedCss('color')
    expect(textColorRed).toBe('rgb(0, 0, 255)')
  })
})
