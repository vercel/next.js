import { nextTestSetup } from 'e2e-utils'

describe('children-page', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('with app dir', () => {
    it('should show the content if you have a page named children', async () => {
      const browser = await next.browser('/children')

      const text = await browser.waitForElementByCss('#children-page').text()

      expect(text).toBe('children - app')

      const currentDisplay = await browser.eval(
        `window.getComputedStyle(document.querySelector('body')).display`
      )

      expect(currentDisplay).toBe('block')
    })
  })

  describe('with pages dir', () => {
    it('should show the content if you have a page named children', async () => {
      const browser = await next.browser('/other/children')

      const text = await browser.waitForElementByCss('#children-page').text()

      expect(text).toBe('children - pages')

      const currentDisplay = await browser.eval(
        `window.getComputedStyle(document.querySelector('body')).display`
      )

      expect(currentDisplay).toBe('block')
    })
  })
})
