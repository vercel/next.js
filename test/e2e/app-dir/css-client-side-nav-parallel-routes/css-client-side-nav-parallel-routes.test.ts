import { nextTestSetup } from 'e2e-utils'

describe('css-client-side-nav-parallel-routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Recommended for tests that need a full browser
  it('should apply styles after navigation', async () => {
    const browser = await next.browser('/source')
    await browser.elementByCss('a').click()
    expect(
      await browser.elementByCss('#global').getComputedCss('background-color')
    ).toBe('rgb(0, 255, 0)')
    expect(
      await browser.elementByCss('#module').getComputedCss('background-color')
    ).toBe('rgb(0, 255, 0)')
  })
})
