/* global describe, it, expect */

import webdriver from 'next-webdriver'

export default (context) => {
  describe('Client Navigation', () => {
    describe('with <Link/>', () => {
      it('should navigate the page', async () => {
        const browser = await webdriver(context.appPort, '/nav')
        const text = await browser
          .elementByCss('a').click()
          .waitForElementByCss('.nav-about')
          .elementByCss('p').text()

        expect(text).toBe('This is the about page.')
        await browser.close()
      })

      it('should navigate via the client side', async () => {
        const browser = await webdriver(context.appPort, '/nav')

        const counterText = await browser
          .elementByCss('#increase').click()
          .elementByCss('a').click()
          .waitForElementByCss('.nav-about')
          .elementByCss('a').click()
          .waitForElementByCss('.nav-home')
          .elementByCss('#counter').text()

        expect(counterText).toBe('Counter: 1')
        await browser.close()
      })
    })

    describe('with <a/> tag inside the <Link />', () => {
      it('should navigate the page', async () => {
        const browser = await webdriver(context.appPort, '/nav/about')
        const text = await browser
          .elementByCss('a').click()
          .waitForElementByCss('.nav-home')
          .elementByCss('p').text()

        expect(text).toBe('This is the home.')
        await browser.close()
      })
    })
  })
}
