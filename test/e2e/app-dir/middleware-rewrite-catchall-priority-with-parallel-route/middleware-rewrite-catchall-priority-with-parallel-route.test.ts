import { nextTestSetup } from 'e2e-utils'

describe('app-dir - middleware rewrite with catch-all and parallel routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('payment route', () => {
    it('should rewrite to the specific page instead of the catch-all with parallel route', async () => {
      const browser = await next.browser('/payment/test')
      const text = await browser.elementByCss('#specific-page').text()

      expect(text).toBe('payment whoops')
      expect(await browser.url()).toBe(next.url + '/payment/test')
    })

    it('should redirect to the specific page instead of the catch-all with parallel route', async () => {
      const browser = await next.browser('/payment/test?redirect=true')
      const text = await browser.elementByCss('#specific-page').text()

      expect(text).toBe('payment whoops')
      expect(await browser.url()).toBe(next.url + '/payment/whoops')
    })
  })

  describe('anotherRoute', () => {
    it('should rewrite to the specific page instead of the catch-all without parallel route', async () => {
      const browser = await next.browser('/anotherRoute/test')
      const text = await browser.elementByCss('#specific-page').text()

      expect(text).toBe('anotherRoute whoops')
      expect(await browser.url()).toBe(next.url + '/anotherRoute/test')
    })

    it('should redirect to the specific page instead of the catch-all without parallel route', async () => {
      const browser = await next.browser('/anotherRoute/test?redirect=true')
      const text = await browser.elementByCss('#specific-page').text()

      expect(text).toBe('anotherRoute whoops')
      expect(await browser.url()).toBe(next.url + '/anotherRoute/whoops')
    })
  })
})
