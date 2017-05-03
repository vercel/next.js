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
        browser.close()
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
        browser.close()
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
        browser.close()
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

        browser.close()
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
        browser.close()
      })

      it('should remove querystring', async () => {
        const browser = await webdriver(context.appPort, '/nav/querystring?id=1')
        const text = await browser
          .elementByCss('#main-page').click()
          .waitForElementByCss('.nav-id-0')
          .elementByCss('p').text()

        expect(text).toBe('0')
        browser.close()
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
        browser.close()
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

        browser.close()
      })
    })

    describe('with hash changes', () => {
      describe('when hash change via Link', () => {
        it('should not run getInitialProps', async () => {
          const browser = await webdriver(context.appPort, '/nav/hash-changes')

          const counter = await browser
            .elementByCss('#via-link').click()
            .elementByCss('p').text()

          expect(counter).toBe('COUNT: 0')

          browser.close()
        })
      })

      describe('when hash change via A tag', () => {
        it('should not run getInitialProps', async () => {
          const browser = await webdriver(context.appPort, '/nav/hash-changes')

          const counter = await browser
            .elementByCss('#via-a').click()
            .elementByCss('p').text()

          expect(counter).toBe('COUNT: 0')

          browser.close()
        })
      })

      describe('when hash get removed', () => {
        it('should not run getInitialProps', async () => {
          const browser = await webdriver(context.appPort, '/nav/hash-changes')

          const counter = await browser
            .elementByCss('#via-a').click()
            .elementByCss('#page-url').click()
            .elementByCss('p').text()

          expect(counter).toBe('COUNT: 1')

          browser.close()
        })
      })

      describe('when hash changed to a different hash', () => {
        it('should not run getInitialProps', async () => {
          const browser = await webdriver(context.appPort, '/nav/hash-changes')

          const counter = await browser
            .elementByCss('#via-a').click()
            .elementByCss('#via-link').click()
            .elementByCss('p').text()

          expect(counter).toBe('COUNT: 0')

          browser.close()
        })
      })
    })

    describe('with shallow routing', () => {
      it('should update the url without running getInitialProps', async () => {
        const browser = await webdriver(context.appPort, '/nav/shallow-routing')
        const counter = await browser
          .elementByCss('#increase').click()
          .elementByCss('#increase').click()
          .elementByCss('#counter').text()
        expect(counter).toBe('Counter: 2')

        const getInitialPropsRunCount = await browser
          .elementByCss('#get-initial-props-run-count').text()
        expect(getInitialPropsRunCount).toBe('getInitialProps run count: 1')

        browser.close()
      })

      it('should handle the back button and should not run getInitialProps', async () => {
        const browser = await webdriver(context.appPort, '/nav/shallow-routing')
        let counter = await browser
          .elementByCss('#increase').click()
          .elementByCss('#increase').click()
          .elementByCss('#counter').text()
        expect(counter).toBe('Counter: 2')

        counter = await browser
          .back()
          .elementByCss('#counter').text()
        expect(counter).toBe('Counter: 1')

        const getInitialPropsRunCount = await browser
          .elementByCss('#get-initial-props-run-count').text()
        expect(getInitialPropsRunCount).toBe('getInitialProps run count: 1')

        browser.close()
      })

      it('should run getInitialProps always when rending the page to the screen', async () => {
        const browser = await webdriver(context.appPort, '/nav/shallow-routing')

        const counter = await browser
          .elementByCss('#increase').click()
          .elementByCss('#increase').click()
          .elementByCss('#home-link').click()
          .waitForElementByCss('.nav-home')
          .back()
          .waitForElementByCss('.shallow-routing')
          .elementByCss('#counter').text()
        expect(counter).toBe('Counter: 2')

        const getInitialPropsRunCount = await browser
          .elementByCss('#get-initial-props-run-count').text()
        expect(getInitialPropsRunCount).toBe('getInitialProps run count: 2')

        browser.close()
      })
    })

    describe('with URL objects', () => {
      it('should work with <Link/>', async () => {
        const browser = await webdriver(context.appPort, '/nav')
        const text = await browser
          .elementByCss('#query-string-link').click()
          .waitForElementByCss('.nav-querystring')
          .elementByCss('p').text()
        expect(text).toBe('10')

        expect(await browser.url())
          .toBe(`http://localhost:${context.appPort}/nav/querystring/10#10`)
        browser.close()
      })

      it('should work with "Router.push"', async () => {
        const browser = await webdriver(context.appPort, '/nav')
        const text = await browser
          .elementByCss('#query-string-button').click()
          .waitForElementByCss('.nav-querystring')
          .elementByCss('p').text()
        expect(text).toBe('10')

        expect(await browser.url())
          .toBe(`http://localhost:${context.appPort}/nav/querystring/10#10`)
        browser.close()
      })

      it('should work with the "replace" prop', async () => {
        const browser = await webdriver(context.appPort, '/nav')

        let stackLength = await browser
          .eval('window.history.length')

        expect(stackLength).toBe(2)

        // Navigation to /about using a replace link should maintain the url stack length
        const text = await browser
          .elementByCss('#about-replace-link').click()
          .waitForElementByCss('.nav-about')
          .elementByCss('p').text()

        expect(text).toBe('This is the about page.')

        stackLength = await browser
          .eval('window.history.length')

        expect(stackLength).toBe(2)

        // Going back to the home with a regular link will augment the history count
        await browser
          .elementByCss('#home-link').click()
          .waitForElementByCss('.nav-home')

        stackLength = await browser
          .eval('window.history.length')

        expect(stackLength).toBe(3)

        browser.close()
      })
    })

    describe('with getInitialProp redirect', () => {
      it('should redirect the page via client side', async () => {
        const browser = await webdriver(context.appPort, '/nav')
        const text = await browser
          .elementByCss('#redirect-link').click()
          .waitForElementByCss('.nav-about')
          .elementByCss('p').text()

        expect(text).toBe('This is the about page.')
        browser.close()
      })

      it('should redirect the page when loading', async () => {
        const browser = await webdriver(context.appPort, '/nav/redirect')
        const text = await browser
          .waitForElementByCss('.nav-about')
          .elementByCss('p').text()

        expect(text).toBe('This is the about page.')
        browser.close()
      })
    })

    describe('with different types of urls', () => {
      it('on normal page', async () => {
        const browser = await webdriver(context.appPort, '/with-cdm')
        const text = await browser.elementByCss('p').text()

        expect(text).toBe('ComponentDidMount executed on client.')
        browser.close()
      })

      it('on dir/index page ', async () => {
        const browser = await webdriver(context.appPort, '/nested-cdm/index')
        const text = await browser.elementByCss('p').text()

        expect(text).toBe('ComponentDidMount executed on client.')
        browser.close()
      })

      it('on dir/ page ', async () => {
        const browser = await webdriver(context.appPort, '/nested-cdm/')
        const text = await browser.elementByCss('p').text()

        expect(text).toBe('ComponentDidMount executed on client.')
        browser.close()
      })
    })

    describe('with asPath', () => {
      describe('inside getInitialProps', () => {
        it('should show the correct asPath with a Link with as prop', async () => {
          const browser = await webdriver(context.appPort, '/nav/')
          const asPath = await browser
            .elementByCss('#as-path-link').click()
            .waitForElementByCss('.as-path-content')
            .elementByCss('.as-path-content').text()

          expect(asPath).toBe('/as/path')
          browser.close()
        })

        it('should show the correct asPath with a Link without the as prop', async () => {
          const browser = await webdriver(context.appPort, '/nav/')
          const asPath = await browser
            .elementByCss('#as-path-link-no-as').click()
            .waitForElementByCss('.as-path-content')
            .elementByCss('.as-path-content').text()

          expect(asPath).toBe('/nav/as-path')
          browser.close()
        })
      })

      describe('with next/router', () => {
        it('should show the correct asPath', async () => {
          const browser = await webdriver(context.appPort, '/nav/')
          const asPath = await browser
            .elementByCss('#as-path-using-router-link').click()
            .waitForElementByCss('.as-path-content')
            .elementByCss('.as-path-content').text()

          expect(asPath).toBe('/nav/as-path-using-router')
          browser.close()
        })
      })
    })
  })
}
