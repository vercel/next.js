import { nextTestSetup } from 'e2e-utils'

// CSS data urls are only supported in Turbopack.
// DEP0144 in the TypeScript config loader prevents fixture startup.
// @force-gate turbopack && !futureCompat
describe('css-data-url-global-pages', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should apply styles from data url correctly', async () => {
    const browser = await next.browser('/')

    const fontWeight = await browser
      .elementByCss('#styled')
      .getComputedCss('font-weight')

    expect(fontWeight).toBe('700')
  })
})
