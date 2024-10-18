import { nextTestSetup } from 'e2e-utils'

describe('pages-dir-css-module-next-dynamic-client-navigation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('nodejs', () => {
    it('should not remove style when navigating from static imported component to next/dynamic', async () => {
      const browser = await next.browser('/next-dynamic/nodejs')
      expect(
        await browser
          .elementByCss('a[href="/next-dynamic/basic"]')
          .click()
          .waitForElementByCss('#red-button')
          .text()
      ).toBe('My background should be red!')

      const buttonBgColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('button')).backgroundColor`
      )
      // red
      expect(buttonBgColor).toBe('rgb(255, 0, 0)')
    })

    it('should not remove style when navigating from static imported component to next/dynamic ssr: false', async () => {
      const browser = await next.browser('/next-dynamic/nodejs')
      expect(
        await browser
          .elementByCss('a[href="/next-dynamic/ssr-false"]')
          .click()
          .waitForElementByCss('#red-button')
          .text()
      ).toBe('My background should be red!')

      const buttonBgColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('button')).backgroundColor`
      )
      // red
      expect(buttonBgColor).toBe('rgb(255, 0, 0)')
    })

    it('should not remove style when navigating from static imported component to on demand next/dynamic', async () => {
      const browser = await next.browser('/next-dynamic/nodejs')
      expect(
        await browser
          .elementByCss('a[href="/next-dynamic/on-demand"]')
          .click()
          .waitForElementByCss('#red-button')
          .text()
      ).toBe('My background should be red!')

      const buttonBgColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('button')).backgroundColor`
      )
      // red
      expect(buttonBgColor).toBe('rgb(255, 0, 0)')
    })

    it('should not remove style when navigating from static imported component with on demand next/dynamic to on demand next/dynamic', async () => {
      const browser = await next.browser('/next-dynamic/nodejs/on-demand')
      expect(
        await browser
          .elementByCss('a[href="/next-dynamic/on-demand"]')
          .click()
          .waitForElementByCss('#red-button')
          .text()
      ).toBe('My background should be red!')

      const buttonBgColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('button')).backgroundColor`
      )
      // red
      expect(buttonBgColor).toBe('rgb(255, 0, 0)')
    })
  })

  describe('edge', () => {
    it('should not remove style when navigating from static imported component to next/dynamic', async () => {
      const browser = await next.browser('/next-dynamic/edge')
      expect(
        await browser
          .elementByCss('a[href="/next-dynamic/basic"]')
          .click()
          .waitForElementByCss('#red-button')
          .text()
      ).toBe('My background should be red!')

      const buttonBgColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('button')).backgroundColor`
      )
      // red
      expect(buttonBgColor).toBe('rgb(255, 0, 0)')
    })

    it('should not remove style when navigating from static imported component to next/dynamic ssr: false', async () => {
      const browser = await next.browser('/next-dynamic/edge')
      expect(
        await browser
          .elementByCss('a[href="/next-dynamic/ssr-false"]')
          .click()
          .waitForElementByCss('#red-button')
          .text()
      ).toBe('My background should be red!')

      const buttonBgColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('button')).backgroundColor`
      )
      // red
      expect(buttonBgColor).toBe('rgb(255, 0, 0)')
    })

    it('should not remove style when navigating from static imported component to on demand next/dynamic', async () => {
      const browser = await next.browser('/next-dynamic/edge')
      expect(
        await browser
          .elementByCss('a[href="/next-dynamic/on-demand"]')
          .click()
          .waitForElementByCss('#red-button')
          .text()
      ).toBe('My background should be red!')

      const buttonBgColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('button')).backgroundColor`
      )
      // red
      expect(buttonBgColor).toBe('rgb(255, 0, 0)')
    })

    it('should not remove style when navigating from static imported component with on demand next/dynamic to on demand next/dynamic', async () => {
      const browser = await next.browser('/next-dynamic/edge/on-demand')
      expect(
        await browser
          .elementByCss('a[href="/next-dynamic/on-demand"]')
          .click()
          .waitForElementByCss('#red-button')
          .text()
      ).toBe('My background should be red!')

      const buttonBgColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('button')).backgroundColor`
      )
      // red
      expect(buttonBgColor).toBe('rgb(255, 0, 0)')
    })
  })
})
