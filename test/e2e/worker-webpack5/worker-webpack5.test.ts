import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Webpack-specific test, not needed for Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Web Workers with webpack 5',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {
        faker: '5.5.3',
      },
    })

    it('should pass on both client and worker', async () => {
      const browser = await next.browser('/')
      await browser.waitForElementByCss('#web-status')
      await retry(async () => {
        expect(await browser.elementByCss('#web-status').text()).toMatch(
          /PASS/i
        )
      })
      await browser.waitForElementByCss('#worker-status')
      await retry(async () => {
        expect(await browser.elementByCss('#worker-status').text()).toMatch(
          /PASS/i
        )
      })
    })
  }
)
