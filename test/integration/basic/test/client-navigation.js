/* global describe, it, expect */

import webdriver from 'next-webdriver'

export default (context, render) => {
  describe('Client Navigation', () => {
    describe('with <Link/>', () => {
      it('should navigate the page', async () => {
        const browser = await webdriver(context.appPort, '/nav')
        const text = await browser
          .elementByCss('#about-link').click()
          .waitForElementByCss('.nav-about')
          .elementByCss('p').text()

        expect(text).toBe('This is the about page.')
        await browser.close()
      })

      it('should navigate via the client side', async () => {
        const browser = await webdriver(context.appPort, '/nav')

        const counterText = await browser
          .elementByCss('#increase').click()
          .elementByCss('#about-link').click()
          .waitForElementByCss('.nav-about')
          .elementByCss('#home-link').click()
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
          .elementByCss('#home-link').click()
          .waitForElementByCss('.nav-home')
          .elementByCss('p').text()

        expect(text).toBe('This is the home.')
        await browser.close()
      })
    })

    describe('with empty getInitialProps()', () => {
      it('should render an error', async () => {
        const browser = await webdriver(context.appPort, '/nav')
        const preText = await browser
          .elementByCss('#empty-props').click()
          .waitForElementByCss('pre')
          .elementByCss('pre').text()

        const expectedErrorMessage = '"EmptyInitialPropsPage.getInitialProps()" should resolve to an object. But found "null" instead.'
        expect(preText.includes(expectedErrorMessage)).toBeTruthy()

        await browser.close()
      })
    })

    describe('with the same page but different querystring', () => {
      it('should navigate the page', async () => {
        const browser = await webdriver(context.appPort, '/nav/querystring?id=1')
        const text = await browser
          .elementByCss('#next-id-link').click()
          .waitForElementByCss('.nav-id-2')
          .elementByCss('p').text()

        expect(text).toBe('2')
        await browser.close()
      })

      it('should remove querystring', async () => {
        const browser = await webdriver(context.appPort, '/nav/querystring?id=1')
        const text = await browser
          .elementByCss('#main-page').click()
          .waitForElementByCss('.nav-id-0')
          .elementByCss('p').text()

        expect(text).toBe('0')
        await browser.close()
      })
    })

    describe('with the current url', () => {
      it('should reload the page', async () => {
        const browser = await webdriver(context.appPort, '/nav/self-reload')
        const defaultCount = await browser.elementByCss('p').text()
        expect(defaultCount).toBe('COUNT: 0')

        const countAfterClicked = await browser
          .elementByCss('#self-reload-link').click()
          .elementByCss('p').text()

        expect(countAfterClicked).toBe('COUNT: 1')
        await browser.close()
      })

      it('should always replace the state', async () => {
        const browser = await webdriver(context.appPort, '/nav')

        const countAfterClicked = await browser
          .elementByCss('#self-reload-link').click()
          .waitForElementByCss('#self-reload-page')
          .elementByCss('#self-reload-link').click()
          .elementByCss('#self-reload-link').click()
          .elementByCss('p').text()

        // counts (page change + two clicks)
        expect(countAfterClicked).toBe('COUNT: 3')

        // Since we replace the state, back button would simply go us back to /nav
        await browser
          .back()
          .waitForElementByCss('.nav-home')

        await browser.close()
      })
    })
  })
}
