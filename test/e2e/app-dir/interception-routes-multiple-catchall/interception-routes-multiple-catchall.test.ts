import { nextTestSetup } from 'e2e-utils'

describe('interception-routes-multiple-catchall', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('multi-param catch-all', () => {
    it('should intercept when navigating to the same path with route interception', async () => {
      const browser = await next.browser('/templates/multi/slug')
      await browser.elementByCss("[href='/showcase/multi/slug']").click()
      await browser.waitForElementByCss('#intercepting-page')
    })

    it('should intercept when navigating to a single param path', async () => {
      const browser = await next.browser('/templates/multi/slug')
      await browser.elementByCss("[href='/showcase/single']").click()
      await browser.waitForElementByCss('#intercepting-page')
    })

    it('should intercept when navigating to a multi-param path', async () => {
      const browser = await next.browser('/templates/multi/slug')
      await browser.elementByCss("[href='/showcase/another/slug']").click()
      await browser.waitForElementByCss('#intercepting-page')
    })
  })

  describe('single param catch-all', () => {
    it('should intercept when navigating to a multi-param path', async () => {
      const browser = await next.browser('/templates/single')
      await browser.elementByCss("[href='/showcase/another/slug']").click()
      await browser.waitForElementByCss('#intercepting-page')
    })

    it('should intercept when navigating to a single param path', async () => {
      const browser = await next.browser('/templates/single')
      await browser.elementByCss("[href='/showcase/single']").click()
      await browser.waitForElementByCss('#intercepting-page')
    })
  })
})
