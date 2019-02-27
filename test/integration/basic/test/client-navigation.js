/* eslint-env jest */
/* global browser */
import { waitFor } from 'next-test-utils'
import {
  getAttribute,
  getElementText,
  getReactErrorOverlayContent
} from 'puppet-utils'

export default (context) => {
  describe('Client Navigation', () => {
    describe('with <Link/>', () => {
      it('should navigate the page', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav'))
        await expect(page).toClick('#about-link')
        await page.waitFor('.nav-about')
        await expect(page).toMatchElement('p', { text: 'This is the about page.' })
        await page.close()
      })

      it('should navigate via the client side', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav'))
        await expect(page).toClick('#increase')
        await expect(page).toClick('#about-link')
        await page.waitFor('.nav-about')
        await expect(page).toClick('#home-link')
        await page.waitFor('.nav-home')
        await expect(page).toMatchElement('#counter', { text: 'Counter: 1' })
        await page.close()
      })
    })

    describe('With url property', () => {
      it('Should keep immutable pathname, asPath and query', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav/url-prop-change'))
        await expect(page).toClick('#add-query')

        const urlResult = await getElementText(page, '#url-result')
        const previousUrlResult = await getElementText(page, '#previous-url-result')

        expect(JSON.parse(urlResult)).toMatchObject({ 'query': { 'added': 'yes' }, 'pathname': '/nav/url-prop-change', 'asPath': '/nav/url-prop-change?added=yes' })
        expect(JSON.parse(previousUrlResult)).toMatchObject({ 'query': {}, 'pathname': '/nav/url-prop-change', 'asPath': '/nav/url-prop-change' })

        await page.close()
      })
    })

    describe('with <a/> tag inside the <Link />', () => {
      it('should navigate the page', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav/about'))

        await expect(page).toClick('#home-link')
        await page.waitFor('.nav-home')
        await expect(page).toMatchElement('p', { text: 'This is the home.' })

        await page.close()
      })

      it('should not navigate if the <a/> tag has a target', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav'))

        await expect(page).toClick('#increase')
        await expect(page).toClick('#target-link')
        await expect(page).toMatchElement('#counter', { text: 'Counter: 1' })

        await page.close()
      })
    })

    describe('with unexpected <a/> nested tag', () => {
      it('should not redirect if passHref prop is not defined in Link', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav/pass-href-prop'))

        await expect(page).toClick('#without-href')
        await page.waitFor('.nav-pass-href-prop')
        await expect(page).toMatchElement('p', { text: 'This is the passHref prop page.' })

        await page.close()
      })

      it('should redirect if passHref prop is defined in Link', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav/pass-href-prop'))

        await expect(page).toClick('#with-href')
        await page.waitFor('.nav-home')
        await expect(page).toMatchElement('p', { text: 'This is the home.' })

        await page.close()
      })
    })

    describe('with empty getInitialProps()', () => {
      it('should render an error', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav'))

        await expect(page).toClick('#empty-props')
        await waitFor(3000)
        await expect(page).toMatchElement('p', { text: 'This is the home.' })

        expect(await getReactErrorOverlayContent(page)).toMatch(
          /should resolve to an object\. But found "null" instead\./
        )
        await page.close()
      })
    })

    describe('with the same page but different querystring', () => {
      it('should navigate the page', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav/querystring?id=1'))

        await expect(page).toClick('#next-id-link')
        await page.waitFor('.nav-id-2')
        await expect(page).toMatchElement('p', { text: '2' })

        await page.close()
      })

      it('should remove querystring', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav/querystring?id=1'))

        await expect(page).toClick('#main-page')
        await page.waitFor('.nav-id-0')
        await expect(page).toMatchElement('p', { text: '0' })

        await page.close()
      })
    })

    describe('with the current url', () => {
      it('should reload the page', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav/self-reload'))

        const defaultCount = await getElementText(page, 'p')
        expect(defaultCount).toBe('COUNT: 0')

        await expect(page).toClick('#self-reload-link')
        await expect(page).toMatchElement('p', { text: 'COUNT: 1' })
        await page.close()
      })

      it('should always replace the state', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav'))

        await expect(page).toClick('#self-reload-link')
        await page.waitFor('#self-reload-page')
        await expect(page).toClick('#self-reload-link')
        await expect(page).toClick('#self-reload-link')
        await expect(page).toMatchElement('p', { text: 'COUNT: 3' })

        // Since we replace the state, back button would simply go us back to /nav
        await page.goBack()
        await page.waitFor('.nav-home')
        await page.close()
      })
    })

    describe('with onClick action', () => {
      it('should reload the page and perform additional action', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav/on-click'))

        const defaultCountQuery = await getElementText(page, '#query-count')
        const defaultCountState = await getElementText(page, '#state-count')
        expect(defaultCountQuery).toBe('QUERY COUNT: 0')
        expect(defaultCountState).toBe('STATE COUNT: 0')

        await expect(page).toClick('#on-click-link')

        const countQueryAfterClicked = await getElementText(page, '#query-count')
        const countStateAfterClicked = await getElementText(page, '#state-count')
        expect(countQueryAfterClicked).toBe('QUERY COUNT: 1')
        expect(countStateAfterClicked).toBe('STATE COUNT: 1')

        await page.close()
      })

      it('should not reload if default was prevented', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav/on-click'))

        const defaultCountQuery = await getElementText(page, '#query-count')
        const defaultCountState = await getElementText(page, '#state-count')
        expect(defaultCountQuery).toBe('QUERY COUNT: 0')
        expect(defaultCountState).toBe('STATE COUNT: 0')

        await expect(page).toClick('#on-click-link-prevent-default')

        const countQueryAfterClicked = await getElementText(page, '#query-count')
        const countStateAfterClicked = await getElementText(page, '#state-count')
        expect(countQueryAfterClicked).toBe('QUERY COUNT: 0')
        expect(countStateAfterClicked).toBe('STATE COUNT: 1')

        await expect(page).toClick('#on-click-link')

        const countQueryAfterClickedAgain = await getElementText(page, '#query-count')
        const countStateAfterClickedAgain = await getElementText(page, '#state-count')
        expect(countQueryAfterClickedAgain).toBe('QUERY COUNT: 1')
        expect(countStateAfterClickedAgain).toBe('STATE COUNT: 2')

        await page.close()
      })

      it('should always replace the state and perform additional action', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav'))

        await expect(page).toClick('#on-click-link')
        await page.waitFor('#on-click-page')

        const defaultCountQuery = await getElementText(page, '#query-count')
        expect(defaultCountQuery).toBe('QUERY COUNT: 1')

        await expect(page).toClick('#on-click-link')
        const countQueryAfterClicked = await getElementText(page, '#query-count')
        const countStateAfterClicked = await getElementText(page, '#state-count')
        expect(countQueryAfterClicked).toBe('QUERY COUNT: 2')
        expect(countStateAfterClicked).toBe('STATE COUNT: 1')

        // Since we replace the state, back button would simply go us back to /nav
        await page.goBack()
        await page.waitFor('.nav-home')

        await page.close()
      })
    })

    describe('with hash changes', () => {
      describe('when hash change via Link', () => {
        it('should not run getInitialProps', async () => {
          const page = await browser.newPage()
          await page.goto(context.server.getURL('/nav/hash-changes'))
          await expect(page).toClick('#via-link')
          await expect(page).toMatchElement('p', { text: 'COUNT: 0' })
          await page.close()
        })

        it('should scroll to the specified position on the same page', async () => {
          const page = await browser.newPage()
          await page.goto(context.server.getURL('/nav/hash-changes'))

          await expect(page).toClick('#scroll-to-item-400')
          /* istanbul ignore next */
          expect(await page.evaluate(() => window.pageYOffset)).toBe(7258)

          await expect(page).toClick('#via-empty-hash')
          /* istanbul ignore next */
          expect(await page.evaluate(() => window.pageYOffset)).toBe(0)

          await page.close()
        })

        it('should scroll to the specified position on the same page with a name property', async () => {
          const page = await browser.newPage()
          await page.goto(context.server.getURL('/nav/hash-changes'))

          await expect(page).toClick('#scroll-to-name-item-400')
          /* istanbul ignore next */
          expect(await page.evaluate(() => window.pageYOffset)).toBe(16258)

          await expect(page).toClick('#via-empty-hash')
          /* istanbul ignore next */
          expect(await page.evaluate(() => window.pageYOffset)).toBe(0)

          await page.close()
        })

        it('should scroll to the specified position to a new page', async () => {
          const page = await browser.newPage()
          await page.goto(context.server.getURL('/nav'))

          await expect(page).toClick('#scroll-to-hash')
          await page.waitFor('#hash-changes-page')

          /* istanbul ignore next */
          expect(await page.evaluate(() => window.pageYOffset)).toBe(7258)

          await page.close()
        })
      })

      describe('when hash change via A tag', () => {
        it('should not run getInitialProps', async () => {
          const page = await browser.newPage()
          await page.goto(context.server.getURL('/nav/hash-changes'))
          await expect(page).toClick('#via-a')
          await expect(page).toMatchElement('p', { text: 'COUNT: 0' })
          await page.close()
        })
      })

      describe('when hash get removed', () => {
        it('should not run getInitialProps', async () => {
          const page = await browser.newPage()
          await page.goto(context.server.getURL('/nav/hash-changes'))
          await expect(page).toClick('#via-a')
          await expect(page).toClick('#page-url')
          await expect(page).toMatchElement('p', { text: 'COUNT: 1' })
          await page.close()
        })
      })

      describe('when hash set to empty', () => {
        it('should not run getInitialProps', async () => {
          const page = await browser.newPage()
          await page.goto(context.server.getURL('/nav/hash-changes'))
          await expect(page).toClick('#via-a')
          await expect(page).toClick('#via-empty-hash')
          await expect(page).toMatchElement('p', { text: 'COUNT: 0' })
          await page.close()
        })
      })

      describe('when hash changed to a different hash', () => {
        it('should not run getInitialProps', async () => {
          const page = await browser.newPage()
          await page.goto(context.server.getURL('/nav/hash-changes'))
          await expect(page).toClick('#via-a')
          await expect(page).toClick('#via-link')
          await expect(page).toMatchElement('p', { text: 'COUNT: 0' })
          await page.close()
        })
      })
    })

    describe('with shallow routing', () => {
      it('should update the url without running getInitialProps', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav/shallow-routing'))
        await expect(page).toClick('#increase')
        await expect(page).toClick('#increase')
        await expect(page).toMatchElement('#counter', { text: 'Counter: 2' })

        await expect(page).toMatchElement('#get-initial-props-run-count', {
          text: 'getInitialProps run count: 1'
        })
        await page.close()
      })

      it('should handle the back button and should not run getInitialProps', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav/shallow-routing'))
        await expect(page).toClick('#increase')
        await expect(page).toClick('#increase')
        await expect(page).toMatchElement('#counter', { text: 'Counter: 2' })

        await page.goBack()
        await expect(page).toMatchElement('#counter', { text: 'Counter: 1' })

        await expect(page).toMatchElement('#get-initial-props-run-count', {
          text: 'getInitialProps run count: 1'
        })
        await page.close()
      })

      it('should run getInitialProps always when rending the page to the screen', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav/shallow-routing'))
        await expect(page).toClick('#increase')
        await expect(page).toClick('#increase')
        await expect(page).toClick('#home-link')

        await page.waitFor('.nav-home')
        await page.goBack()
        await page.waitFor('.shallow-routing')

        await expect(page).toMatchElement('#counter', { text: 'Counter: 2' })

        await expect(page).toMatchElement('#get-initial-props-run-count', {
          text: 'getInitialProps run count: 2'
        })
        await page.close()
      })
    })

    describe('with URL objects', () => {
      it('should work with <Link/>', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav'))
        await expect(page).toClick('#query-string-link')
        await page.waitFor('.nav-querystring')
        await expect(page).toMatchElement('p', { text: '10' })

        expect(await page.url()).toBe(`http://localhost:${context.appPort}/nav/querystring/10#10`)
        await page.close()
      })

      it('should work with "Router.push"', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav'))
        await expect(page).toClick('#query-string-button')
        await page.waitFor('.nav-querystring')
        await expect(page).toMatchElement('p', { text: '10' })

        expect(await page.url()).toBe(`http://localhost:${context.appPort}/nav/querystring/10#10`)
        await page.close()
      })

      it('should work with the "replace" prop', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav'))

        /* istanbul ignore next */
        let stackLength = await page.evaluate(() => window.history.length)
        expect(stackLength).toBe(2)

        await expect(page).toClick('#about-replace-link')
        await page.waitFor('.nav-about')
        await expect(page).toMatchElement('p', { text: 'This is the about page.' })

        /* istanbul ignore next */
        stackLength = await page.evaluate(() => window.history.length)
        expect(stackLength).toBe(2)

        await expect(page).toClick('#home-link')
        await page.waitFor('.nav-home')

        /* istanbul ignore next */
        stackLength = await page.evaluate(() => window.history.length)
        expect(stackLength).toBe(3)

        await page.close()
      })
    })

    describe('with getInitialProp redirect', () => {
      it('should redirect the page via client side', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav'))
        await expect(page).toClick('#redirect-link')
        await page.waitFor('.nav-about')
        await expect(page).toMatchElement('p', { text: 'This is the about page.' })

        await page.close()
      })

      it('should redirect the page when loading', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav/redirect'))
        await page.waitFor('.nav-about')
        await expect(page).toMatchElement('p', { text: 'This is the about page.' })
        await page.close()
      })
    })

    describe('with different types of urls', () => {
      it('should work with normal page', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/with-cdm'))
        await expect(page).toMatchElement('p', {
          text: 'ComponentDidMount executed on client.'
        })
        await page.close()
      })

      it('should work with dir/ page', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nested-cdm'))
        await expect(page).toMatchElement('p', {
          text: 'ComponentDidMount executed on client.'
        })
        await page.close()
      })

      it('should work with /index page', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/index'))
        await expect(page).toMatchElement('p', {
          text: 'ComponentDidMount executed on client.'
        })
        await page.close()
      })

      it('should work with / page', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/'))
        await expect(page).toMatchElement('p', {
          text: 'ComponentDidMount executed on client.'
        })
        await page.close()
      })
    })

    describe('with the HOC based router', () => {
      it('should navigate as expected', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav/with-hoc'))

        await expect(page).toMatchElement('#pathname', {
          text: 'Current path: /nav/with-hoc'
        })
        await expect(page).toMatchElement('#asPath', {
          text: 'Current asPath: /nav/with-hoc'
        })
        await expect(page).toClick('.nav-with-hoc a')
        await page.waitFor('.nav-home')
        await expect(page).toMatchElement('p', { text: 'This is the home.' })

        await page.close()
      })
    })

    describe('with asPath', () => {
      describe('inside getInitialProps', () => {
        it('should show the correct asPath with a Link with as prop', async () => {
          const page = await browser.newPage()
          await page.goto(context.server.getURL('/nav'))
          await expect(page).toClick('#as-path-link')
          await page.waitFor('.as-path-content')
          await expect(page).toMatchElement('.as-path-content', { text: '/as/path' })
          await page.close()
        })

        it('should show the correct asPath with a Link without the as prop', async () => {
          const page = await browser.newPage()
          await page.goto(context.server.getURL('/nav'))
          await expect(page).toClick('#as-path-link-no-as')
          await page.waitFor('.as-path-content')
          await expect(page).toMatchElement('.as-path-content', { text: '/nav/as-path' })
          await page.close()
        })
      })

      describe('with next/router', () => {
        it('should show the correct asPath', async () => {
          const page = await browser.newPage()
          await page.goto(context.server.getURL('/nav'))
          await expect(page).toClick('#as-path-using-router-link')
          await page.waitFor('.as-path-content')
          await expect(page).toMatchElement('.as-path-content', {
            text: '/nav/as-path-using-router'
          })
          await page.close()
        })
      })

      describe('with next/link', () => {
        it('should use pushState with same href and different asPath', async () => {
          const page = await browser.newPage()
          await page.goto(context.server.getURL('/nav/as-path-pushstate'))
          await expect(page).toClick('#hello')
          await page.waitFor('#something-hello')

          const queryOne = JSON.parse(await getElementText(page, '#router-query'))
          expect(queryOne.something).toBe('hello')

          await expect(page).toClick('#same-query')
          await page.waitFor('#something-same-query')

          const queryTwo = JSON.parse(await getElementText(page, '#router-query'))
          expect(queryTwo.something).toBe('hello')

          await page.goBack()
          await page.waitFor('#something-hello')

          const queryThree = JSON.parse(await getElementText(page, '#router-query'))
          expect(queryThree.something).toBe('hello')

          await expect(page).toClick('#else')
          await page.waitFor('#something-else')

          await expect(page).toClick('#hello2')
          await page.waitFor('#nav-as-path-pushstate')

          await page.goBack()
          await page.waitFor('#something-else')

          const queryFour = JSON.parse(await getElementText(page, '#router-query'))
          expect(queryFour.something).toBe(undefined)

          await page.close()
        })
      })
    })

    describe('runtime errors', () => {
      it('should show react-error-overlay when a client side error is thrown inside a component', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/error-inside-browser-page'))

        const text = await getReactErrorOverlayContent(page)
        expect(text).toMatch(/An Expected error occurred/)
        expect(text).toMatch(/pages\/error-inside-browser-page\.js:5/)

        await page.close()
      })

      it('should show react-error-overlay when a client side error is thrown outside a component', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/error-in-the-browser-global-scope'))

        await waitFor(3000)
        const text = await getReactErrorOverlayContent(page)
        expect(text).toMatch(/An Expected error occurred/)
        expect(text).toMatch(/error-in-the-browser-global-scope\.js:2/)

        await page.close()
      })
    })

    describe('with 404 pages', () => {
      it('should 404 on not existent page', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/non-existent'))
        await expect(page).toMatchElement('h1', { text: '404' })
        await expect(page).toMatchElement('h2', { text: 'This page could not be found.' })
        await page.close()
      })

      it('should 404 for <page>/', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav/about/'))
        await expect(page).toMatchElement('h1', { text: '404' })
        await expect(page).toMatchElement('h2', { text: 'This page could not be found.' })
        await page.close()
      })

      it('should should not contain a page script in a 404 page', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/non-existent'))
        const hasPageScript = await page.$$eval('script[src]', scripts => scripts.some(
          script => script
            .getAttribute('src')
            .includes('/non-existent')
        ))
        expect(hasPageScript).toBeFalsy()
        await page.close()
      })
    })

    describe('updating head while client routing', () => {
      it('should update head during client routing', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/nav/head-1'))

        expect(await getAttribute(page, 'meta[name="description"]', 'content')).toBe('Head One')
        await expect(page).toClick('#to-head-2')
        await page.waitFor('#head-2')

        expect(await getAttribute(page, 'meta[name="description"]', 'content')).toBe('Head Two')
        await expect(page).toClick('#to-head-1')
        await page.waitFor('#head-1')

        expect(await getAttribute(page, 'meta[name="description"]', 'content')).toBe('Head One')
        await page.close()
      })
    })

    it('should not error on module.exports + polyfills', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL('/read-only-object-error'))
      expect(await getElementText(page, 'body')).toBe('this is just a placeholder component')
      await page.close()
    })

    it('should work on nested /index/index.js', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL('/nested-index/index'))
      await expect(page).toMatchElement('p', {
        text: 'This is an index.js nested in an index/ folder.'
      })
      await page.close()
    })
  })
}
