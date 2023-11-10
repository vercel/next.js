import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'dont-reset-shallow-url-updates-on-prefetch',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should work using browser', async () => {
      const browser = await next.browser('/')
      const button = await browser.elementByCss('button')
      await button.click()
      expect(await browser.url()).toMatch(/\?foo=bar$/)
      const link = await browser.elementByCss('a')
      await link.hover()
      // Hovering a prefetch link should keep the URL intact
      expect(await browser.url()).toMatch(/\?foo=bar$/)
      // await browser.elementByCss('uncomment-to-keep-the-browser-open')
    })
  }
)
