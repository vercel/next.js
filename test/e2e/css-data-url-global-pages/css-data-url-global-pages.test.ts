import { nextTestSetup } from 'e2e-utils'

// CSS data urls are only supported in Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'css-data-url-global-pages',
  () => {
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
  }
)
