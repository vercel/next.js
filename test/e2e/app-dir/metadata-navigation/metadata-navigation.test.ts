import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir - metadata-navigation',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should show the index title', async () => {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('title').text()).toBe('Home Layout')
    })

    it('should show target page metadata after navigation', async () => {
      const browser = await next.browser('/')
      await browser.elementByCss('#product-link').click()
      await browser.waitForElementByCss('#product-title')
      expect(await browser.elementByCss('title').text()).toBe('Product Layout')
    })

    it('should show target page metadata after navigation with back', async () => {
      const browser = await next.browser('/')
      await browser.elementByCss('#product-link').click()
      await browser.waitForElementByCss('#product-title')
      await browser.elementByCss('#home-link').click()
      await browser.waitForElementByCss('#home-title')
      expect(await browser.elementByCss('title').text()).toBe('Home Layout')
    })
  }
)
