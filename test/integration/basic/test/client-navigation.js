/* eslint-env jest */

import webdriver from 'next-webdriver'
import {waitFor, getReactErrorOverlayContent} from 'next-test-utils'

export default (context, render) => {
  describe('Client Navigation', () => {
    let browser
    afterEach(() => browser.quit())

    describe('with <Link/>', () => {
      it('should navigate the page', async () => {
        browser = await webdriver(context.appPort, '/nav')

        const text = await browser
          .elementByCss('#about-link').click()
          .waitForElementByCss('.nav-about')
          .elementByCss('p').text()

        expect(text).toBe('This is the about page.')
      })

      it('should navigate via the client side', async () => {
        browser = await webdriver(context.appPort, '/nav')

        const counterText = await browser
          .elementByCss('#increase').click()
          .elementByCss('#about-link').click()
          .waitForElementByCss('.nav-about')
          .elementByCss('#home-link').click()
          .waitForElementByCss('.nav-home')
          .elementByCss('#counter').text()

        expect(counterText).toBe('Counter: 1')
      })
    })

    describe('With url property', () => {
      it('Should keep immutable pathname, asPath and query', async () => {
        browser = await webdriver(context.appPort, '/nav/url-prop-change')

        await browser.elementByCss('#add-query').click()
        const urlResult = await browser.elementByCss('#url-result').text()
        const previousUrlResult = await browser.elementByCss('#previous-url-result').text()

        expect(JSON.parse(urlResult)).toMatchObject({'query': {'added': 'yes'}, 'pathname': '/nav/url-prop-change', 'asPath': '/nav/url-prop-change?added=yes'})
        expect(JSON.parse(previousUrlResult)).toMatchObject({'query': {}, 'pathname': '/nav/url-prop-change', 'asPath': '/nav/url-prop-change'})
      })
    })

    describe('with <a/> tag inside the <Link />', () => {
      it('should navigate the page', async () => {
        browser = await webdriver(context.appPort, '/nav/about')

        const text = await browser
          .elementByCss('#home-link').click()
          .waitForElementByCss('.nav-home')
          .elementByCss('p').text()

        expect(text).toBe('This is the home.')
      })

      it('should not navigate if the <a/> tag has a target', async () => {
        browser = await webdriver(context.appPort, '/nav')

        const counterText = await browser
          .elementByCss('#increase').click()
          .elementByCss('#target-link').click()
          .elementByCss('#counter').text()

        expect(counterText).toBe('Counter: 1')
      })
    })

    describe('with unexpected <a/> nested tag', () => {
      it('should not redirect if passHref prop is not defined in Link', async () => {
        browser = await webdriver(context.appPort, '/nav/pass-href-prop')

        const text = await browser
          .elementByCss('#without-href').click()
          .waitForElementByCss('.nav-pass-href-prop')
          .elementByCss('p').text()

        expect(text).toBe('This is the passHref prop page.')
      })

      it('should redirect if passHref prop is defined in Link', async () => {
        browser = await webdriver(context.appPort, '/nav/pass-href-prop')

        const text = await browser
          .elementByCss('#with-href').click()
          .waitForElementByCss('.nav-home')
          .elementByCss('p').text()

        expect(text).toBe('This is the home.')
      })
    })

    describe('with empty getInitialProps()', () => {
      it('should render an error', async () => {
        browser = await webdriver(context.appPort, '/nav')

        await browser.elementByCss('#empty-props').click()
        await waitFor(3000)

        const reactOverlay = await getReactErrorOverlayContent(browser)
        expect(reactOverlay).toMatch(
          /should resolve to an object\. But found "null" instead\./
        )
      })
    })

    describe('with the same page but different querystring', () => {
      it('should navigate the page', async () => {
        browser = await webdriver(context.appPort, '/nav/querystring?id=1')

        const text = await browser
          .elementByCss('#next-id-link').click()
          .waitForElementByCss('.nav-id-2')
          .elementByCss('p').text()

        expect(text).toBe('2')
      })

      it('should remove querystring', async () => {
        browser = await webdriver(context.appPort, '/nav/querystring?id=1')

        const text = await browser
          .elementByCss('#main-page').click()
          .waitForElementByCss('.nav-id-0')
          .elementByCss('p').text()

        expect(text).toBe('0')
      })
    })

    describe('with the current url', () => {
      it('should reload the page', async () => {
        browser = await webdriver(context.appPort, '/nav/self-reload')

        const defaultCount = await browser.elementByCss('p').text()
        expect(defaultCount).toBe('COUNT: 0')

        const countAfterClicked = await browser
          .elementByCss('#self-reload-link').click()
          .elementByCss('p').text()

        expect(countAfterClicked).toBe('COUNT: 1')
      })

      it('should always replace the state', async () => {
        browser = await webdriver(context.appPort, '/nav')

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
      })
    })

    describe('with onClick action', () => {
      it('should reload the page and perform additional action', async () => {
        browser = await webdriver(context.appPort, '/nav/on-click')

        const defaultCountQuery = await browser.elementByCss('#query-count').text()
        const defaultCountState = await browser.elementByCss('#state-count').text()
        expect(defaultCountQuery).toBe('QUERY COUNT: 0')
        expect(defaultCountState).toBe('STATE COUNT: 0')

        await browser.elementByCss('#on-click-link').click()

        const countQueryAfterClicked = await browser.elementByCss('#query-count').text()
        const countStateAfterClicked = await browser.elementByCss('#state-count').text()
        expect(countQueryAfterClicked).toBe('QUERY COUNT: 1')
        expect(countStateAfterClicked).toBe('STATE COUNT: 1')
      })

      it('should not reload if default was prevented', async () => {
        browser = await webdriver(context.appPort, '/nav/on-click')

        const defaultCountQuery = await browser.elementByCss('#query-count').text()
        const defaultCountState = await browser.elementByCss('#state-count').text()
        expect(defaultCountQuery).toBe('QUERY COUNT: 0')
        expect(defaultCountState).toBe('STATE COUNT: 0')

        await browser.elementByCss('#on-click-link-prevent-default').click()

        const countQueryAfterClicked = await browser.elementByCss('#query-count').text()
        const countStateAfterClicked = await browser.elementByCss('#state-count').text()
        expect(countQueryAfterClicked).toBe('QUERY COUNT: 0')
        expect(countStateAfterClicked).toBe('STATE COUNT: 1')

        await browser.elementByCss('#on-click-link').click()

        const countQueryAfterClickedAgain = await browser.elementByCss('#query-count').text()
        const countStateAfterClickedAgain = await browser.elementByCss('#state-count').text()
        expect(countQueryAfterClickedAgain).toBe('QUERY COUNT: 1')
        expect(countStateAfterClickedAgain).toBe('STATE COUNT: 2')
      })

      it('should always replace the state and perform additional action', async () => {
        browser = await webdriver(context.appPort, '/nav')

        await browser.elementByCss('#on-click-link').click().waitForElementByCss('#on-click-page')

        const defaultCountQuery = await browser.elementByCss('#query-count').text()
        expect(defaultCountQuery).toBe('QUERY COUNT: 1')

        await browser.elementByCss('#on-click-link').click()
        const countQueryAfterClicked = await browser.elementByCss('#query-count').text()
        const countStateAfterClicked = await browser.elementByCss('#state-count').text()
        expect(countQueryAfterClicked).toBe('QUERY COUNT: 2')
        expect(countStateAfterClicked).toBe('STATE COUNT: 1')

        // Since we replace the state, back button would simply go us back to /nav
        await browser.back().waitForElementByCss('.nav-home')
      })
    })

    describe('with hash changes', () => {
      describe('when hash change via Link', () => {
        it('should not run getInitialProps', async () => {
          browser = await webdriver(context.appPort, '/nav/hash-changes')

          const counter = await browser
            .elementByCss('#via-link').click()
            .elementByCss('p').text()

          expect(counter).toBe('COUNT: 0')
        })

        it('should scroll to the specified position on the same page', async () => {
          browser = await webdriver(context.appPort, '/nav/hash-changes')

          // Scrolls to item 400 on the page
          const scrollPosition = await browser
            .elementByCss('#scroll-to-item-400').click()
            .eval('window.pageYOffset')

          expect(scrollPosition).toBe(7258)

          // Scrolls back to top when scrolling to `#` with no value.
          const scrollPositionAfterEmptyHash = await browser
            .elementByCss('#via-empty-hash').click()
            .eval('window.pageYOffset')

          expect(scrollPositionAfterEmptyHash).toBe(0)
        })

        it('should scroll to the specified position on the same page with a name property', async () => {
          browser = await webdriver(context.appPort, '/nav/hash-changes')

          // Scrolls to item 400 with name="name-item-400" on the page
          const scrollPosition = await browser
            .elementByCss('#scroll-to-name-item-400').click()
            .eval('window.pageYOffset')

          console.log(scrollPosition)

          expect(scrollPosition).toBe(16258)

          // Scrolls back to top when scrolling to `#` with no value.
          const scrollPositionAfterEmptyHash = await browser
            .elementByCss('#via-empty-hash').click()
            .eval('window.pageYOffset')

          expect(scrollPositionAfterEmptyHash).toBe(0)
        })

        it('should scroll to the specified position to a new page', async () => {
          browser = await webdriver(context.appPort, '/nav')

          // Scrolls to item 400 on the page
          await browser
            .elementByCss('#scroll-to-hash').click()
            .waitForElementByCss('#hash-changes-page')

          const scrollPosition = await browser.eval('window.pageYOffset')
          expect(scrollPosition).toBe(7258)
        })
      })

      describe('when hash change via A tag', () => {
        it('should not run getInitialProps', async () => {
          browser = await webdriver(context.appPort, '/nav/hash-changes')

          const counter = await browser
            .elementByCss('#via-a').click()
            .elementByCss('p').text()

          expect(counter).toBe('COUNT: 0')
        })
      })

      describe('when hash get removed', () => {
        it('should not run getInitialProps', async () => {
          browser = await webdriver(context.appPort, '/nav/hash-changes')

          const counter = await browser
            .elementByCss('#via-a').click()
            .elementByCss('#page-url').click()
            .elementByCss('p').text()

          expect(counter).toBe('COUNT: 1')
        })
      })

      describe('when hash set to empty', () => {
        it('should not run getInitialProps', async () => {
          browser = await webdriver(context.appPort, '/nav/hash-changes')

          const counter = await browser
            .elementByCss('#via-a').click()
            .elementByCss('#via-empty-hash').click()
            .elementByCss('p').text()

          expect(counter).toBe('COUNT: 0')
        })
      })

      describe('when hash changed to a different hash', () => {
        it('should not run getInitialProps', async () => {
          browser = await webdriver(context.appPort, '/nav/hash-changes')

          const counter = await browser
            .elementByCss('#via-a').click()
            .elementByCss('#via-link').click()
            .elementByCss('p').text()

          expect(counter).toBe('COUNT: 0')
        })
      })
    })

    describe('with shallow routing', () => {
      it('should update the url without running getInitialProps', async () => {
        browser = await webdriver(context.appPort, '/nav/shallow-routing')
        const counter = await browser
          .elementByCss('#increase').click()
          .elementByCss('#increase').click()
          .elementByCss('#counter').text()

        expect(counter).toBe('Counter: 2')

        const getInitialPropsRunCount = await browser
          .elementByCss('#get-initial-props-run-count').text()

        expect(getInitialPropsRunCount).toBe('getInitialProps run count: 1')
      })

      it('should handle the back button and should not run getInitialProps', async () => {
        browser = await webdriver(context.appPort, '/nav/shallow-routing')

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
      })

      it('should run getInitialProps always when rending the page to the screen', async () => {
        browser = await webdriver(context.appPort, '/nav/shallow-routing')

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
      })
    })

    describe('with URL objects', () => {
      it('should work with <Link/>', async () => {
        browser = await webdriver(context.appPort, '/nav')

        const text = await browser
          .elementByCss('#query-string-link').click()
          .waitForElementByCss('.nav-querystring')
          .elementByCss('p').text()

        expect(text).toBe('10')

        const url = await browser.url()
        expect(url).toBe(`http://localhost:${context.appPort}/nav/querystring/10#10`)
      })

      it('should work with "Router.push"', async () => {
        browser = await webdriver(context.appPort, '/nav')

        const text = await browser
          .elementByCss('#query-string-button').click()
          .waitForElementByCss('.nav-querystring')
          .elementByCss('p').text()

        expect(text).toBe('10')

        const url = await browser.url()
        expect(url).toBe(`http://localhost:${context.appPort}/nav/querystring/10#10`)
      })

      it('should work with the "replace" prop', async () => {
        browser = await webdriver(context.appPort, '/nav')

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
      })
    })

    describe('with getInitialProp redirect', () => {
      it('should redirect the page via client side', async () => {
        browser = await webdriver(context.appPort, '/nav')

        const text = await browser
          .elementByCss('#redirect-link').click()
          .waitForElementByCss('.nav-about')
          .elementByCss('p').text()

        expect(text).toBe('This is the about page.')
      })

      it('should redirect the page when loading', async () => {
        browser = await webdriver(context.appPort, '/nav/redirect')

        const text = await browser
          .waitForElementByCss('.nav-about')
          .elementByCss('p').text()

        expect(text).toBe('This is the about page.')
      })
    })

    describe('with different types of urls', () => {
      it('should work with normal page', async () => {
        browser = await webdriver(context.appPort, '/with-cdm')

        const text = await browser.elementByCss('p').text()

        expect(text).toBe('ComponentDidMount executed on client.')
      })

      it('should work with dir/ page', async () => {
        browser = await webdriver(context.appPort, '/nested-cdm')

        const text = await browser.elementByCss('p').text()

        expect(text).toBe('ComponentDidMount executed on client.')
      })

      it('should work with /index page', async () => {
        browser = await webdriver(context.appPort, '/index')

        const text = await browser.elementByCss('p').text()

        expect(text).toBe('ComponentDidMount executed on client.')
      })

      it('should work with / page', async () => {
        browser = await webdriver(context.appPort, '/')

        const text = await browser.elementByCss('p').text()

        expect(text).toBe('ComponentDidMount executed on client.')
      })
    })

    describe('with the HOC based router', () => {
      it('should navigate as expected', async () => {
        browser = await webdriver(context.appPort, '/nav/with-hoc')

        const pathname = await browser.elementByCss('#pathname').text()
        expect(pathname).toBe('Current path: /nav/with-hoc')

        const asPath = await browser.elementByCss('#asPath').text()
        expect(asPath).toBe('Current asPath: /nav/with-hoc')

        const text = await browser
          .elementByCss('.nav-with-hoc a').click()
          .waitForElementByCss('.nav-home')
          .elementByCss('p').text()

        expect(text).toBe('This is the home.')
      })
    })

    describe('with asPath', () => {
      describe('inside getInitialProps', () => {
        it('should show the correct asPath with a Link with as prop', async () => {
          browser = await webdriver(context.appPort, '/nav')

          const asPath = await browser
            .elementByCss('#as-path-link').click()
            .waitForElementByCss('.as-path-content')
            .elementByCss('.as-path-content').text()

          expect(asPath).toBe('/as/path')
        })

        it('should show the correct asPath with a Link without the as prop', async () => {
          browser = await webdriver(context.appPort, '/nav')

          const asPath = await browser
            .elementByCss('#as-path-link-no-as').click()
            .waitForElementByCss('.as-path-content')
            .elementByCss('.as-path-content').text()

          expect(asPath).toBe('/nav/as-path')
        })
      })

      describe('with next/router', () => {
        it('should show the correct asPath', async () => {
          browser = await webdriver(context.appPort, '/nav')

          const asPath = await browser
            .elementByCss('#as-path-using-router-link').click()
            .waitForElementByCss('.as-path-content')
            .elementByCss('.as-path-content').text()

          expect(asPath).toBe('/nav/as-path-using-router')
        })
      })

      describe('with next/link', () => {
        it('should use pushState with same href and different asPath', async () => {
          browser = await webdriver(context.appPort, '/nav/as-path-pushstate')

          await browser.elementByCss('#hello').click().waitForElementByCss('#something-hello')
          const queryOne = JSON.parse(await browser.elementByCss('#router-query').text())
          expect(queryOne.something).toBe('hello')

          await browser.elementByCss('#same-query').click().waitForElementByCss('#something-same-query')
          const queryTwo = JSON.parse(await browser.elementByCss('#router-query').text())
          expect(queryTwo.something).toBe('hello')

          await browser.back().waitForElementByCss('#something-hello')
          const queryThree = JSON.parse(await browser.elementByCss('#router-query').text())
          expect(queryThree.something).toBe('hello')
        })
      })
    })

    describe('runtime errors', () => {
      it('should show ErrorDebug when a client side error is thrown inside a component', async () => {
        browser = await webdriver(context.appPort, '/error-inside-browser-page')
        await waitFor(3000)
        const text = await getReactErrorOverlayContent(browser)
        expect(text).toMatch(/An Expected error occured/)
        expect(text).toMatch(/pages\/error-inside-browser-page\.js:5/)
      })

      it('should show ErrorDebug when a client side error is thrown outside a component', async () => {
        browser = await webdriver(context.appPort, '/error-in-the-browser-global-scope')
        await waitFor(3000)
        const text = await getReactErrorOverlayContent(browser)
        expect(text).toMatch(/An Expected error occured/)
        expect(text).toMatch(/error-in-the-browser-global-scope\.js:2/)
      })
    })

    describe('with 404 pages', () => {
      it('should 404 on not existent page', async () => {
        browser = await webdriver(context.appPort, '/non-existent')
        expect(await browser.elementByCss('h1').text()).toBe('404')
        expect(await browser.elementByCss('h2').text()).toBe('This page could not be found.')
      })

      it('should 404 for <page>/', async () => {
        browser = await webdriver(context.appPort, '/nav/about/')
        expect(await browser.elementByCss('h1').text()).toBe('404')
        expect(await browser.elementByCss('h2').text()).toBe('This page could not be found.')
      })

      it('should should not contain a page script in a 404 page', async () => {
        browser = await webdriver(context.appPort, '/non-existent')
        const scripts = await browser.elementsByCss('script[src]')
        for (const script of scripts) {
          const src = await script.getAttribute('src')
          expect(src.includes('/non-existent')).toBeFalsy()
        }
      })
    })

    describe('updating head while client routing', () => {
      it('should update head during client routing', async () => {
        browser = await webdriver(context.appPort, '/nav/head-1')
        expect(await browser.elementByCss('meta[name="description"]').getAttribute('content')).toBe('Head One')
        await browser.elementByCss('#to-head-2').click().waitForElementByCss('#head-2')
        expect(await browser.elementByCss('meta[name="description"]').getAttribute('content')).toBe('Head Two')
        await browser.elementByCss('#to-head-1').click().waitForElementByCss('#head-1')
        expect(await browser.elementByCss('meta[name="description"]').getAttribute('content')).toBe('Head One')
      })
    })
  })
}
