import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'pages-to-app-routing',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should work using browser', async () => {
      const browser = await next.browser('/abc')
      expect(await browser.elementByCss('#params').text()).toBe(
        'Params: {"slug":"abc"}'
      )

      await browser
        .elementByCss('#to-about-link')
        .click()
        .waitForElementByCss('#app-page')

      expect(await browser.elementByCss('#app-page').text()).toBe('About')
    })

    it('should not add default locale as base path', async () => {
      const browser = await next.browser('/')

      await browser
        .elementByCss('#home-to-about')
        .click()
        .waitForElementByCss('#app-page')

      expect(await browser.elementByCss('#app-page').text()).toBe('About')
      expect(await browser.url()).toBe(`${next.url}/about`)
    })
  }
)
