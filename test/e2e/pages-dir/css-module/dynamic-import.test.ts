import { nextTestSetup } from 'e2e-utils'

describe('pages-dir-css-module-next-dynamic-client-navigation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('nodejs', () => {
    it('should not remove style when navigating from static imported component to dynamic import', async () => {
      const browser = await next.browser('/dynamic-import/nodejs')
      expect(
        await browser
          .elementByCss('a[href="/dynamic-import/basic"]')
          .click()
          .waitForElementByCss('#red-button')
          .text()
      ).toBe('My background should be red!')

      const buttonBgColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('button')).backgroundColor`
      )
      // not gray
      expect(buttonBgColor).not.toBe('rgb(239, 239, 239)')
      // but red
      expect(buttonBgColor).toBe('rgb(255, 0, 0)')
    })
  })

  describe('edge', () => {
    it('should not remove style when navigating from static imported component to dynamic import', async () => {
      const browser = await next.browser('/dynamic-import/edge')
      expect(
        await browser
          .elementByCss('a[href="/dynamic-import/basic"]')
          .click()
          .waitForElementByCss('#red-button')
          .text()
      ).toBe('My background should be red!')

      const buttonBgColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('button')).backgroundColor`
      )
      // not gray
      expect(buttonBgColor).not.toBe('rgb(239, 239, 239)')
      // but red
      expect(buttonBgColor).toBe('rgb(255, 0, 0)')
    })
  })
})
