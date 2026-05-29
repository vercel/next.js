import { nextTestSetup } from 'e2e-utils'

// CSS data urls are only support in Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'css-modules-data-urls',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should apply rsc class name from data url correctly', async () => {
      const browser = await next.browser('/')

      const clientElementClass =
        (await browser.elementByCss('#client').getAttribute('class')) || ''

      expect(clientElementClass).not.toBe('')
    })

    it('should apply rsc styles from data url correctly', async () => {
      const browser = await next.browser('/')

      const rscElement = await browser
        .elementByCss('#rsc')
        .getComputedCss('font-weight')

      expect(rscElement).toBe('700')
    })

    it('should apply client class name from data url correctly', async () => {
      const browser = await next.browser('/')

      const clientElementClass =
        (await browser.elementByCss('#client').getAttribute('class')) || ''

      expect(clientElementClass).not.toBe('')
    })

    it('should apply client styles from data url correctly', async () => {
      const browser = await next.browser('/')

      const clientElement = await browser
        .elementByCss('#client')
        .getComputedCss('font-weight')

      expect(clientElement).toBe('700')
    })
  }
)
