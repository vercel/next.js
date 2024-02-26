import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir - global error - with catch-all route',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextStart }) => {
    it('should render catch-all route correctly', async () => {
      expect(await next.render('/en/foo')).toContain('catch-all page')
    })

    it('should render 404 page correctly', async () => {
      expect(await next.render('/en')).toContain(
        'This page could not be found.'
      )
    })

    if (isNextStart) {
      it('should render global error correctly', async () => {
        const browser = await next.browser('/en/error')

        const text = await browser.elementByCss('#global-error').text()
        expect(text).toBe('global-error')
      })
    }
  }
)
