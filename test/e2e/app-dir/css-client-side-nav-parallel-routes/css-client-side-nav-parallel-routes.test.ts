import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('css-client-side-nav-parallel-routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Recommended for tests that need a full browser
  it('should apply styles after navigation', async () => {
    const browser = await next.browser('/source')
    await browser.elementByCss('a').click()

    // transition might not be instant so we wrap in retry
    retry(async () => {
      expect(
        await browser.elementByCss('#global').getComputedCss('background-color')
      ).toBe('rgb(0, 255, 0)')
      expect(
        await browser.elementByCss('#module').getComputedCss('background-color')
      ).toBe('rgb(0, 255, 0)')
    })
  })
})
