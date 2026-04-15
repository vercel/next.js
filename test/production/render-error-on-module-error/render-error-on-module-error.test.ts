import { nextTestSetup } from 'e2e-utils'

describe('Module Init Error', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const { next } = nextTestSetup({ files: __dirname })

      it('should render error page', async () => {
        const browser = await next.browser('/')
        const text = await browser.waitForElementByCss('#error-p').text()
        expect(text).toBe('Error Rendered')
      })
    }
  )
})
