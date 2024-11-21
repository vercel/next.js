/* eslint-env jest */

import {
  assertHasRedbox,
  assertNoRedbox,
  fetchViaHTTP,
  getRedboxSource,
  getRedboxHeader,
  waitFor,
  check,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

const isReact18 = parseInt(process.env.NEXT_TEST_REACT_VERSION) === 18

describe('Client Navigation', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
    env: {
      TEST_STRICT_NEXT_HEAD: String(true),
    },
  })

  it('should not reload when visiting /_error directly', async () => {
    const { status } = await fetchViaHTTP(next.appPort, '/_error')
    const browser = await webdriver(next.appPort, '/_error')

    await browser.eval('window.hello = true')

    // wait on-demand-entries timeout since it can trigger
    // reloading non-stop
    for (let i = 0; i < 15; i++) {
      expect(await browser.eval('window.hello')).toBe(true)
      await waitFor(1000)
    }
    const html = await browser.eval('document.documentElement.innerHTML')

    expect(status).toBe(404)
    expect(html).toContain('This page could not be found')
    expect(html).toContain('404')
  })

  describe('with <Link/>', () => {
    it('should navigate the page', async () => {
      const browser = await webdriver(next.appPort, '/nav')
      const text = await browser
        .elementByCss('#about-link')
        .click()
        .waitForElementByCss('.nav-about')
        .elementByCss('p')
        .text()

      expect(text).toBe('This is the about page.')
      await browser.close()
    })

    it('should have proper error when no children are provided', async () => {
      const browser = await webdriver(next.appPort, '/link-no-child')
      await assertHasRedbox(browser, {
        pageResponseCode: 500,
      })
      expect(await getRedboxHeader(browser)).toContain(
        'No children were passed to <Link> with `href` of `/about` but one child is required'
      )
    })

    it('should not throw error when one number type child is provided', async () => {
      const browser = await webdriver(next.appPort, '/link-number-child')
      await assertNoRedbox(browser)
      if (browser) await browser.close()
    })

    it('should navigate back after reload', async () => {
      const browser = await webdriver(next.appPort, '/nav')
      await browser.elementByCss('#about-link').click()
      await browser.waitForElementByCss('.nav-about')
      await browser.refresh()
      await waitFor(3000)
      await browser.back()
      await waitFor(3000)
      const text = await browser.elementByCss('#about-link').text()
      if (browser) await browser.close()
      expect(text).toMatch(/About/)
    })

    it('should navigate forwards after reload', async () => {
      const browser = await webdriver(next.appPort, '/nav')
      await browser.elementByCss('#about-link').click()
      await browser.waitForElementByCss('.nav-about')
      await browser.back()
      await browser.refresh()
      await waitFor(3000)
      await browser.forward()
      await waitFor(3000)
      const text = await browser.elementByCss('p').text()
      if (browser) await browser.close()
      expect(text).toMatch(/this is the about page/i)
    })

    it('should error when calling onClick without event', async () => {
      const browser = await webdriver(next.appPort, '/link-invalid-onclick')
      expect(await browser.elementByCss('#errors').text()).toBe('0')
      await browser.elementByCss('#custom-button').click()
      expect(await browser.elementByCss('#errors').text()).toBe('1')
    })

    it('should navigate via the client side', async () => {
      const browser = await webdriver(next.appPort, '/nav')

      const counterText = await browser
        .elementByCss('#increase')
        .click()
        .elementByCss('#about-link')
        .click()
        .waitForElementByCss('.nav-about')
        .elementByCss('#home-link')
        .click()
        .waitForElementByCss('.nav-home')
        .elementByCss('#counter')
        .text()

      expect(counterText).toBe('Counter: 1')
      await browser.close()
    })

    it('should navigate an absolute url', async () => {
      const browser = await webdriver(
        next.appPort,
        `/absolute-url?port=${next.appPort}`
      )
      await browser.waitForElementByCss('#absolute-link').click()
      await check(
        () => browser.eval(() => window.location.origin),
        'https://vercel.com'
      )
    })

    it('should call mouse handlers with an absolute url', async () => {
      const browser = await webdriver(
        next.appPort,
        `/absolute-url?port=${next.appPort}`
      )

      await browser.elementByCss('#absolute-link-mouse-events').moveTo()

      expect(
        await browser
          .waitForElementByCss('#absolute-link-mouse-events')
          .getAttribute('data-hover')
      ).toBe('true')
    })

    it('should navigate an absolute local url', async () => {
      const browser = await webdriver(
        next.appPort,
        `/absolute-url?port=${next.appPort}`
      )
      // @ts-expect-error _didNotNavigate is set intentionally
      await browser.eval(() => (window._didNotNavigate = true))
      await browser.waitForElementByCss('#absolute-local-link').click()
      const text = await browser
        .waitForElementByCss('.nav-about')
        .elementByCss('p')
        .text()

      expect(text).toBe('This is the about page.')
      // @ts-expect-error _didNotNavigate is set intentionally
      expect(await browser.eval(() => window._didNotNavigate)).toBe(true)
    })

    it('should navigate an absolute local url with as', async () => {
      const browser = await webdriver(
        next.appPort,
        `/absolute-url?port=${next.appPort}`
      )
      // @ts-expect-error _didNotNavigate is set intentionally
      await browser.eval(() => (window._didNotNavigate = true))
      await browser.waitForElementByCss('#absolute-local-dynamic-link').click()
      expect(await browser.waitForElementByCss('#dynamic-page').text()).toBe(
        'hello'
      )
      // @ts-expect-error _didNotNavigate is set intentionally
      expect(await browser.eval(() => window._didNotNavigate)).toBe(true)
    })
  })

  describe('with <a/> tag inside the <Link />', () => {
    it('should navigate the page', async () => {
      const browser = await webdriver(next.appPort, '/nav/about')
      const text = await browser
        .elementByCss('#home-link')
        .click()
        .waitForElementByCss('.nav-home')
        .elementByCss('p')
        .text()

      expect(text).toBe('This is the home.')
      await browser.close()
    })

    it('should not navigate if the <a/> tag has a target', async () => {
      const browser = await webdriver(next.appPort, '/nav')

      await browser
        .elementByCss('#increase')
        .click()
        .elementByCss('#target-link')
        .click()

      await waitFor(1000)

      const counterText = await browser.elementByCss('#counter').text()

      expect(counterText).toBe('Counter: 1')
      await browser.close()
    })

    it('should not navigate if the click-event is modified', async () => {
      const browser = await webdriver(next.appPort, '/nav')

      await browser.elementByCss('#increase').click()

      const key = process.platform === 'darwin' ? 'Meta' : 'Control'

      await browser.keydown(key)

      await browser.elementByCss('#in-svg-link').click()

      await browser.keyup(key)
      await waitFor(1000)

      const counterText = await browser.elementByCss('#counter').text()

      expect(counterText).toBe('Counter: 1')
      await browser.close()
    })

    it('should not reload when link in svg is clicked', async () => {
      const browser = await webdriver(next.appPort, '/nav')
      await browser.eval('window.hello = true')
      await browser
        .elementByCss('#in-svg-link')
        .click()
        .waitForElementByCss('.nav-about')

      expect(await browser.eval('window.hello')).toBe(true)
      await browser.close()
    })
  })

  describe('with unexpected <a/> nested tag', () => {
    it('should not redirect if passHref prop is not defined in Link', async () => {
      const browser = await webdriver(next.appPort, '/nav/pass-href-prop')
      const text = await browser
        .elementByCss('#without-href')
        .click()
        .waitForElementByCss('.nav-pass-href-prop')
        .elementByCss('p')
        .text()

      expect(text).toBe('This is the passHref prop page.')
      await browser.close()
    })

    it('should redirect if passHref prop is defined in Link', async () => {
      const browser = await webdriver(next.appPort, '/nav/pass-href-prop')
      const text = await browser
        .elementByCss('#with-href')
        .click()
        .waitForElementByCss('.nav-home')
        .elementByCss('p')
        .text()

      expect(text).toBe('This is the home.')
      await browser.close()
    })
  })

  describe('with empty getInitialProps()', () => {
    it('should render an error', async () => {
      let browser
      try {
        browser = await webdriver(next.appPort, '/nav')
        await browser.elementByCss('#empty-props').click()
        await assertHasRedbox(browser)
        expect(await getRedboxHeader(browser)).toMatch(
          /should resolve to an object\. But found "null" instead\./
        )
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })

  describe('with the same page but different querystring', () => {
    it('should navigate the page', async () => {
      const browser = await webdriver(next.appPort, '/nav/querystring?id=1')
      const text = await browser
        .elementByCss('#next-id-link')
        .click()
        .waitForElementByCss('.nav-id-2')
        .elementByCss('p')
        .text()

      expect(text).toBe('2')
      await browser.close()
    })

    it('should remove querystring', async () => {
      const browser = await webdriver(next.appPort, '/nav/querystring?id=1')
      const text = await browser
        .elementByCss('#main-page')
        .click()
        .waitForElementByCss('.nav-id-0')
        .elementByCss('p')
        .text()

      expect(text).toBe('0')
      await browser.close()
    })
  })

  describe('with the current url', () => {
    it('should reload the page', async () => {
      const browser = await webdriver(next.appPort, '/nav/self-reload')
      const defaultCount = await browser.elementByCss('p').text()
      expect(defaultCount).toBe('COUNT: 0')

      const countAfterClicked = await browser
        .elementByCss('#self-reload-link')
        .click()
        .elementByCss('p')
        .text()

      expect(countAfterClicked).toBe('COUNT: 1')
      await browser.close()
    })

    it('should always replace the state', async () => {
      const browser = await webdriver(next.appPort, '/nav')

      const countAfterClicked = await browser
        .elementByCss('#self-reload-link')
        .click()
        .waitForElementByCss('#self-reload-page')
        .elementByCss('#self-reload-link')
        .click()
        .elementByCss('#self-reload-link')
        .click()
        .elementByCss('p')
        .text()

      // counts (page change + two clicks)
      expect(countAfterClicked).toBe('COUNT: 3')

      // Since we replace the state, back button would simply go us back to /nav
      await browser.back().waitForElementByCss('.nav-home')

      await browser.close()
    })
  })

  describe('with onClick action', () => {
    it('should reload the page and perform additional action', async () => {
      let browser
      try {
        browser = await webdriver(next.appPort, '/nav/on-click')
        const defaultCountQuery = await browser
          .elementByCss('#query-count')
          .text()
        const defaultCountState = await browser
          .elementByCss('#state-count')
          .text()
        expect(defaultCountQuery).toBe('QUERY COUNT: 0')
        expect(defaultCountState).toBe('STATE COUNT: 0')

        await browser.elementByCss('#on-click-link').click()

        const countQueryAfterClicked = await browser
          .elementByCss('#query-count')
          .text()
        const countStateAfterClicked = await browser
          .elementByCss('#state-count')
          .text()
        expect(countQueryAfterClicked).toBe('QUERY COUNT: 1')
        expect(countStateAfterClicked).toBe('STATE COUNT: 1')
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should not reload if default was prevented', async () => {
      let browser
      try {
        browser = await webdriver(next.appPort, '/nav/on-click')
        const defaultCountQuery = await browser
          .elementByCss('#query-count')
          .text()
        const defaultCountState = await browser
          .elementByCss('#state-count')
          .text()
        expect(defaultCountQuery).toBe('QUERY COUNT: 0')
        expect(defaultCountState).toBe('STATE COUNT: 0')

        await browser.elementByCss('#on-click-link-prevent-default').click()

        const countQueryAfterClicked = await browser
          .elementByCss('#query-count')
          .text()
        const countStateAfterClicked = await browser
          .elementByCss('#state-count')
          .text()
        expect(countQueryAfterClicked).toBe('QUERY COUNT: 0')
        expect(countStateAfterClicked).toBe('STATE COUNT: 1')

        await browser.elementByCss('#on-click-link').click()

        const countQueryAfterClickedAgain = await browser
          .elementByCss('#query-count')
          .text()
        const countStateAfterClickedAgain = await browser
          .elementByCss('#state-count')
          .text()
        expect(countQueryAfterClickedAgain).toBe('QUERY COUNT: 1')
        expect(countStateAfterClickedAgain).toBe('STATE COUNT: 2')
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should always replace the state and perform additional action', async () => {
      let browser
      try {
        browser = await webdriver(next.appPort, '/nav')

        await browser
          .elementByCss('#on-click-link')
          .click()
          .waitForElementByCss('#on-click-page')

        const defaultCountQuery = await browser
          .elementByCss('#query-count')
          .text()
        expect(defaultCountQuery).toBe('QUERY COUNT: 1')

        await browser.elementByCss('#on-click-link').click()
        const countQueryAfterClicked = await browser
          .elementByCss('#query-count')
          .text()
        const countStateAfterClicked = await browser
          .elementByCss('#state-count')
          .text()
        expect(countQueryAfterClicked).toBe('QUERY COUNT: 2')
        expect(countStateAfterClicked).toBe('STATE COUNT: 1')

        // Since we replace the state, back button would simply go us back to /nav
        await browser.back().waitForElementByCss('.nav-home')
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })
  describe('resets scroll at the correct time', () => {
    it('should reset scroll before the new page runs its lifecycles (<Link />)', async () => {
      let browser
      try {
        browser = await webdriver(next.appPort, '/nav/long-page-to-snap-scroll')

        // Scrolls to item 400 on the page
        await browser
          .waitForElementByCss('#long-page-to-snap-scroll')
          .elementByCss('#scroll-to-item-400')
          .click()

        const scrollPosition = await browser.eval('window.pageYOffset')
        expect(scrollPosition).toBe(7208)

        // Go to snap scroll page
        await browser
          .elementByCss('#goto-snap-scroll-position')
          .click()
          .waitForElementByCss('#scroll-pos-y')

        const snappedScrollPosition = await browser.eval(
          'document.getElementById("scroll-pos-y").innerText'
        )
        expect(snappedScrollPosition).toBe('0')
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should reset scroll before the new page runs its lifecycles (Router#push)', async () => {
      let browser
      try {
        browser = await webdriver(next.appPort, '/nav/long-page-to-snap-scroll')

        // Scrolls to item 400 on the page
        await browser
          .waitForElementByCss('#long-page-to-snap-scroll')
          .elementByCss('#scroll-to-item-400')
          .click()

        const scrollPosition = await browser.eval('window.pageYOffset')
        expect(scrollPosition).toBe(7208)

        // Go to snap scroll page
        await browser
          .elementByCss('#goto-snap-scroll-position-imperative')
          .click()
          .waitForElementByCss('#scroll-pos-y')

        const snappedScrollPosition = await browser.eval(
          'document.getElementById("scroll-pos-y").innerText'
        )
        expect(snappedScrollPosition).toBe('0')
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should intentionally not reset scroll before the new page runs its lifecycles (Router#push)', async () => {
      let browser
      try {
        browser = await webdriver(next.appPort, '/nav/long-page-to-snap-scroll')

        // Scrolls to item 400 on the page
        await browser
          .waitForElementByCss('#long-page-to-snap-scroll')
          .elementByCss('#scroll-to-item-400')
          .click()

        const scrollPosition = await browser.eval('window.pageYOffset')
        expect(scrollPosition).toBe(7208)

        // Go to snap scroll page
        await browser
          .elementByCss('#goto-snap-scroll-position-imperative-noscroll')
          .click()
          .waitForElementByCss('#scroll-pos-y')

        const snappedScrollPosition = await browser.eval(
          'document.getElementById("scroll-pos-y").innerText'
        )
        expect(snappedScrollPosition).not.toBe('0')
        expect(Number(snappedScrollPosition)).toBeGreaterThanOrEqual(7208)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })

  describe('with hash changes', () => {
    describe('check hydration mis-match', () => {
      it('should not have hydration mis-match for hash link', async () => {
        const browser = await webdriver(next.appPort, '/nav/hash-changes')
        const browserLogs = await browser.log()
        let found = false
        browserLogs.forEach((log) => {
          console.log('log.message', log.message)
          if (log.message.includes('Warning: Prop')) {
            found = true
          }
        })
        expect(found).toEqual(false)
      })
    })

    describe('when hash change via Link', () => {
      it('should not run getInitialProps', async () => {
        const browser = await webdriver(next.appPort, '/nav/hash-changes')

        const counter = await browser
          .elementByCss('#via-link')
          .click()
          .elementByCss('p')
          .text()

        expect(counter).toBe('COUNT: 0')

        await browser.close()
      })

      it('should scroll to the specified position on the same page', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/nav/hash-changes')

          // Scrolls to item 400 on the page
          await browser.elementByCss('#scroll-to-item-400').click()

          const scrollPositionBeforeEmptyHash =
            await browser.eval('window.pageYOffset')

          expect(scrollPositionBeforeEmptyHash).toBe(7258)

          // Scrolls back to top when scrolling to `#` with no value.
          await browser.elementByCss('#via-empty-hash').click()

          const scrollPositionAfterEmptyHash =
            await browser.eval('window.pageYOffset')

          expect(scrollPositionAfterEmptyHash).toBe(0)

          // Scrolls to item 400 on the page
          await browser.elementByCss('#scroll-to-item-400').click()

          const scrollPositionBeforeTopHash =
            await browser.eval('window.pageYOffset')

          expect(scrollPositionBeforeTopHash).toBe(7258)

          // Scrolls back to top when clicking link with href `#top`.
          await browser.elementByCss('#via-top-hash').click()

          const scrollPositionAfterTopHash =
            await browser.eval('window.pageYOffset')

          expect(scrollPositionAfterTopHash).toBe(0)

          // Scrolls to cjk anchor on the page
          await browser.elementByCss('#scroll-to-cjk-anchor').click()

          const scrollPositionCJKHash = await browser.eval('window.pageYOffset')

          expect(scrollPositionCJKHash).toBe(17436)
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      it('should not scroll to hash when scroll={false} is set', async () => {
        const browser = await webdriver(next.appPort, '/nav/hash-changes')
        const curScroll = await browser.eval(
          'document.documentElement.scrollTop'
        )
        await browser.elementByCss('#scroll-to-name-item-400-no-scroll').click()
        expect(curScroll).toBe(
          await browser.eval('document.documentElement.scrollTop')
        )
      })

      it('should scroll to the specified position on the same page with a name property', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/nav/hash-changes')

          // Scrolls to item 400 with name="name-item-400" on the page
          await browser.elementByCss('#scroll-to-name-item-400').click()

          const scrollPosition = await browser.eval('window.pageYOffset')

          expect(scrollPosition).toBe(16258)

          // Scrolls back to top when scrolling to `#` with no value.
          await browser.elementByCss('#via-empty-hash').click()

          const scrollPositionAfterEmptyHash =
            await browser.eval('window.pageYOffset')

          expect(scrollPositionAfterEmptyHash).toBe(0)
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      it('should scroll to the specified position to a new page', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/nav')

          // Scrolls to item 400 on the page
          await browser
            .elementByCss('#scroll-to-hash')
            .click()
            .waitForElementByCss('#hash-changes-page')

          const scrollPosition = await browser.eval('window.pageYOffset')
          expect(scrollPosition).toBe(7258)
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      it('should scroll to the specified CJK position to a new page', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/nav')

          // Scrolls to CJK anchor on the page
          await browser
            .elementByCss('#scroll-to-cjk-hash')
            .click()
            .waitForElementByCss('#hash-changes-page')

          const scrollPosition = await browser.eval('window.pageYOffset')
          expect(scrollPosition).toBe(17436)
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      it('Should update asPath', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/nav/hash-changes')

          await browser.elementByCss('#via-link').click()

          const asPath = await browser.elementByCss('div#asPath').text()
          expect(asPath).toBe('ASPATH: /nav/hash-changes#via-link')
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })
    })

    describe('when hash change via A tag', () => {
      it('should not run getInitialProps', async () => {
        const browser = await webdriver(next.appPort, '/nav/hash-changes')

        const counter = await browser
          .elementByCss('#via-a')
          .click()
          .elementByCss('p')
          .text()

        expect(counter).toBe('COUNT: 0')

        await browser.close()
      })
    })

    describe('when hash get removed', () => {
      it('should not run getInitialProps', async () => {
        const browser = await webdriver(next.appPort, '/nav/hash-changes')

        const counter = await browser
          .elementByCss('#via-a')
          .click()
          .elementByCss('#page-url')
          .click()
          .elementByCss('p')
          .text()

        expect(counter).toBe('COUNT: 1')

        await browser.close()
      })

      it('should not run getInitialProps when removing via back', async () => {
        const browser = await webdriver(next.appPort, '/nav/hash-changes')

        const counter = await browser
          .elementByCss('#scroll-to-item-400')
          .click()
          .back()
          .elementByCss('p')
          .text()

        expect(counter).toBe('COUNT: 0')
        await browser.close()
      })
    })

    describe('when hash set to empty', () => {
      it('should not run getInitialProps', async () => {
        const browser = await webdriver(next.appPort, '/nav/hash-changes')

        const counter = await browser
          .elementByCss('#via-a')
          .click()
          .elementByCss('#via-empty-hash')
          .click()
          .elementByCss('p')
          .text()

        expect(counter).toBe('COUNT: 0')

        await browser.close()
      })
    })
  })

  describe('with hash changes with state', () => {
    describe('when passing state via hash change', () => {
      it('should increment the history state counter', async () => {
        const browser = await webdriver(
          next.appPort,
          '/nav/hash-changes-with-state#'
        )

        const historyCount = await browser
          .elementByCss('#increment-history-count')
          .click()
          .elementByCss('#increment-history-count')
          .click()
          .elementByCss('div#history-count')
          .text()

        expect(historyCount).toBe('HISTORY COUNT: 2')

        const counter = await browser.elementByCss('p').text()

        // getInitialProps should not be called with only hash changes
        expect(counter).toBe('COUNT: 0')

        await browser.close()
      })

      it('should increment the shallow history state counter', async () => {
        const browser = await webdriver(
          next.appPort,
          '/nav/hash-changes-with-state#'
        )

        const historyCount = await browser
          .elementByCss('#increment-shallow-history-count')
          .click()
          .elementByCss('#increment-shallow-history-count')
          .click()
          .elementByCss('div#shallow-history-count')
          .text()

        expect(historyCount).toBe('SHALLOW HISTORY COUNT: 2')

        const counter = await browser.elementByCss('p').text()

        expect(counter).toBe('COUNT: 0')

        await browser.close()
      })
    })
  })

  describe('with shallow routing', () => {
    it('should update the url without running getInitialProps', async () => {
      const browser = await webdriver(next.appPort, '/nav/shallow-routing')
      const counter = await browser
        .elementByCss('#increase')
        .click()
        .elementByCss('#increase')
        .click()
        .elementByCss('#counter')
        .text()
      expect(counter).toBe('Counter: 2')

      const getInitialPropsRunCount = await browser
        .elementByCss('#get-initial-props-run-count')
        .text()
      expect(getInitialPropsRunCount).toBe('getInitialProps run count: 1')

      await browser.close()
    })

    it('should handle the back button and should not run getInitialProps', async () => {
      const browser = await webdriver(next.appPort, '/nav/shallow-routing')
      let counter = await browser
        .elementByCss('#increase')
        .click()
        .elementByCss('#increase')
        .click()
        .elementByCss('#counter')
        .text()
      expect(counter).toBe('Counter: 2')

      counter = await browser.back().elementByCss('#counter').text()
      expect(counter).toBe('Counter: 1')

      const getInitialPropsRunCount = await browser
        .elementByCss('#get-initial-props-run-count')
        .text()
      expect(getInitialPropsRunCount).toBe('getInitialProps run count: 1')

      await browser.close()
    })

    it('should run getInitialProps always when rending the page to the screen', async () => {
      const browser = await webdriver(next.appPort, '/nav/shallow-routing')

      const counter = await browser
        .elementByCss('#increase')
        .click()
        .elementByCss('#increase')
        .click()
        .elementByCss('#home-link')
        .click()
        .waitForElementByCss('.nav-home')
        .back()
        .waitForElementByCss('.shallow-routing')
        .elementByCss('#counter')
        .text()
      expect(counter).toBe('Counter: 2')

      const getInitialPropsRunCount = await browser
        .elementByCss('#get-initial-props-run-count')
        .text()
      expect(getInitialPropsRunCount).toBe('getInitialProps run count: 2')

      await browser.close()
    })

    it('should keep the scroll position on shallow routing', async () => {
      const browser = await webdriver(next.appPort, '/nav/shallow-routing')
      await browser.eval(() =>
        document.querySelector('#increase').scrollIntoView()
      )
      const scrollPosition = await browser.eval('window.pageYOffset')

      expect(scrollPosition).toBeGreaterThan(3000)

      await browser.elementByCss('#increase').click()
      await waitFor(500)
      const newScrollPosition = await browser.eval('window.pageYOffset')

      expect(newScrollPosition).toBe(scrollPosition)

      await browser.elementByCss('#increase2').click()
      await waitFor(500)
      const newScrollPosition2 = await browser.eval('window.pageYOffset')

      expect(newScrollPosition2).toBe(0)

      await browser.eval(() =>
        document.querySelector('#invalidShallow').scrollIntoView()
      )
      const scrollPositionDown = await browser.eval('window.pageYOffset')

      expect(scrollPositionDown).toBeGreaterThan(3000)

      await browser.elementByCss('#invalidShallow').click()
      await waitFor(500)
      const newScrollPosition3 = await browser.eval('window.pageYOffset')

      expect(newScrollPosition3).toBe(0)
    })
  })

  it('should scroll to top when the scroll option is set to true', async () => {
    const browser = await webdriver(next.appPort, '/nav/shallow-routing')
    await browser.eval(() =>
      document.querySelector('#increaseWithScroll').scrollIntoView()
    )
    const scrollPosition = await browser.eval('window.pageYOffset')

    expect(scrollPosition).toBeGreaterThan(3000)

    await browser.elementByCss('#increaseWithScroll').click()
    await check(async () => {
      const newScrollPosition = await browser.eval('window.pageYOffset')
      return newScrollPosition === 0 ? 'success' : 'fail'
    }, 'success')
  })

  describe('with URL objects', () => {
    it('should work with <Link/>', async () => {
      const browser = await webdriver(next.appPort, '/nav')
      const text = await browser
        .elementByCss('#query-string-link')
        .click()
        .waitForElementByCss('.nav-querystring')
        .elementByCss('p')
        .text()
      expect(text).toBe('10')

      expect(await browser.url()).toBe(
        `http://localhost:${next.appPort}/nav/querystring/10#10`
      )
      await browser.close()
    })

    it('should work with "Router.push"', async () => {
      const browser = await webdriver(next.appPort, '/nav')
      const text = await browser
        .elementByCss('#query-string-button')
        .click()
        .waitForElementByCss('.nav-querystring')
        .elementByCss('p')
        .text()
      expect(text).toBe('10')

      expect(await browser.url()).toBe(
        `http://localhost:${next.appPort}/nav/querystring/10#10`
      )
      await browser.close()
    })

    it('should work with the "replace" prop', async () => {
      const browser = await webdriver(next.appPort, '/nav')

      let stackLength = await browser.eval('window.history.length')

      expect(stackLength).toBe(2)

      // Navigation to /about using a replace link should maintain the url stack length
      const text = await browser
        .elementByCss('#about-replace-link')
        .click()
        .waitForElementByCss('.nav-about')
        .elementByCss('p')
        .text()

      expect(text).toBe('This is the about page.')

      stackLength = await browser.eval('window.history.length')

      expect(stackLength).toBe(2)

      // Going back to the home with a regular link will augment the history count
      await browser
        .elementByCss('#home-link')
        .click()
        .waitForElementByCss('.nav-home')

      stackLength = await browser.eval('window.history.length')

      expect(stackLength).toBe(3)

      await browser.close()
    })

    it('should handle undefined in router.push', async () => {
      const browser = await webdriver(next.appPort, '/nav/query-params')
      await browser.elementByCss('#click-me').click()
      const query = JSON.parse(
        await browser.waitForElementByCss('#query-value').text()
      )
      expect(query).toEqual({
        param1: '',
        param2: '',
        param3: '',
        param4: '0',
        param5: 'false',
        param7: '',
        param8: '',
        param9: '',
        param10: '',
        param11: ['', '', '', '0', 'false', '', '', '', '', ''],
      })
    })
  })

  describe('with querystring relative urls', () => {
    it('should work with Link', async () => {
      const browser = await webdriver(next.appPort, '/nav/query-only')
      try {
        await browser.elementByCss('#link').click()

        await check(() => browser.waitForElementByCss('#prop').text(), 'foo')
      } finally {
        await browser.close()
      }
    })

    it('should work with router.push', async () => {
      const browser = await webdriver(next.appPort, '/nav/query-only')
      try {
        await browser.elementByCss('#router-push').click()

        await check(() => browser.waitForElementByCss('#prop').text(), 'bar')
      } finally {
        await browser.close()
      }
    })

    it('should work with router.replace', async () => {
      const browser = await webdriver(next.appPort, '/nav/query-only')
      try {
        await browser.elementByCss('#router-replace').click()

        await check(() => browser.waitForElementByCss('#prop').text(), 'baz')
      } finally {
        await browser.close()
      }
    })

    it('router.replace with shallow=true shall not throw route cancelled errors', async () => {
      const browser = await webdriver(next.appPort, '/nav/query-only-shallow')
      try {
        await browser.elementByCss('#router-replace').click()
        // the error occurs on every replace() after the first one
        await browser.elementByCss('#router-replace').click()

        await check(
          () => browser.waitForElementByCss('#routeState').text(),
          '{"completed":2,"errors":0}'
        )
      } finally {
        await browser.close()
      }
    })
  })

  describe('with getInitialProp redirect', () => {
    it('should redirect the page via client side', async () => {
      const browser = await webdriver(next.appPort, '/nav')
      const text = await browser
        .elementByCss('#redirect-link')
        .click()
        .waitForElementByCss('.nav-about')
        .elementByCss('p')
        .text()

      expect(text).toBe('This is the about page.')
      await browser.close()
    })

    it('should redirect the page when loading', async () => {
      const browser = await webdriver(next.appPort, '/nav/redirect')
      const text = await browser
        .waitForElementByCss('.nav-about')
        .elementByCss('p')
        .text()

      expect(text).toBe('This is the about page.')
      await browser.close()
    })
  })

  describe('with different types of urls', () => {
    it('should work with normal page', async () => {
      const browser = await webdriver(next.appPort, '/with-cdm')
      const text = await browser.elementByCss('p').text()

      expect(text).toBe('ComponentDidMount executed on client.')
      await browser.close()
    })

    it('should work with dir/ page', async () => {
      const browser = await webdriver(next.appPort, '/nested-cdm')
      const text = await browser.elementByCss('p').text()

      expect(text).toBe('ComponentDidMount executed on client.')
      await browser.close()
    })

    it('should not work with /index page', async () => {
      const browser = await webdriver(next.appPort, '/index')
      expect(await browser.elementByCss('h1').text()).toBe('404')
      expect(await browser.elementByCss('h2').text()).toBe(
        'This page could not be found.'
      )
      await browser.close()
    })

    it('should work with / page', async () => {
      const browser = await webdriver(next.appPort, '/')
      const text = await browser.elementByCss('p').text()

      expect(text).toBe('ComponentDidMount executed on client.')
      await browser.close()
    })
  })

  describe('with the HOC based router', () => {
    it('should navigate as expected', async () => {
      const browser = await webdriver(next.appPort, '/nav/with-hoc')

      const pathname = await browser.elementByCss('#pathname').text()
      expect(pathname).toBe('Current path: /nav/with-hoc')

      const asPath = await browser.elementByCss('#asPath').text()
      expect(asPath).toBe('Current asPath: /nav/with-hoc')

      const text = await browser
        .elementByCss('.nav-with-hoc a')
        .click()
        .waitForElementByCss('.nav-home')
        .elementByCss('p')
        .text()

      expect(text).toBe('This is the home.')
      await browser.close()
    })
  })

  describe('with asPath', () => {
    describe('inside getInitialProps', () => {
      it('should show the correct asPath with a Link with as prop', async () => {
        const browser = await webdriver(next.appPort, '/nav')
        const asPath = await browser
          .elementByCss('#as-path-link')
          .click()
          .waitForElementByCss('.as-path-content')
          .elementByCss('.as-path-content')
          .text()

        expect(asPath).toBe('/as/path')
        await browser.close()
      })

      it('should show the correct asPath with a Link without the as prop', async () => {
        const browser = await webdriver(next.appPort, '/nav')
        const asPath = await browser
          .elementByCss('#as-path-link-no-as')
          .click()
          .waitForElementByCss('.as-path-content')
          .elementByCss('.as-path-content')
          .text()

        expect(asPath).toBe('/nav/as-path')
        await browser.close()
      })
    })

    describe('with next/router', () => {
      it('should show the correct asPath', async () => {
        const browser = await webdriver(next.appPort, '/nav')
        const asPath = await browser
          .elementByCss('#as-path-using-router-link')
          .click()
          .waitForElementByCss('.as-path-content')
          .elementByCss('.as-path-content')
          .text()

        expect(asPath).toBe('/nav/as-path-using-router')
        await browser.close()
      })

      it('should navigate an absolute url on push', async () => {
        const browser = await webdriver(
          next.appPort,
          `/absolute-url?port=${next.appPort}`
        )
        await browser.waitForElementByCss('#router-push').click()
        await check(
          () => browser.eval(() => window.location.origin),
          'https://vercel.com'
        )
      })

      it('should navigate an absolute url on replace', async () => {
        const browser = await webdriver(
          next.appPort,
          `/absolute-url?port=${next.appPort}`
        )
        await browser.waitForElementByCss('#router-replace').click()
        await check(
          () => browser.eval(() => window.location.origin),
          'https://vercel.com'
        )
      })

      it('should navigate an absolute local url on push', async () => {
        const browser = await webdriver(
          next.appPort,
          `/absolute-url?port=${next.appPort}`
        )
        // @ts-expect-error _didNotNavigate is set intentionally
        await browser.eval(() => (window._didNotNavigate = true))
        await browser.waitForElementByCss('#router-local-push').click()
        const text = await browser
          .waitForElementByCss('.nav-about')
          .elementByCss('p')
          .text()
        expect(text).toBe('This is the about page.')
        // @ts-expect-error _didNotNavigate is set intentionally
        expect(await browser.eval(() => window._didNotNavigate)).toBe(true)
      })

      it('should navigate an absolute local url on replace', async () => {
        const browser = await webdriver(
          next.appPort,
          `/absolute-url?port=${next.appPort}`
        )
        // @ts-expect-error _didNotNavigate is set intentionally
        await browser.eval(() => (window._didNotNavigate = true))
        await browser.waitForElementByCss('#router-local-replace').click()
        const text = await browser
          .waitForElementByCss('.nav-about')
          .elementByCss('p')
          .text()
        expect(text).toBe('This is the about page.')
        // @ts-expect-error _didNotNavigate is set intentionally
        expect(await browser.eval(() => window._didNotNavigate)).toBe(true)
      })
    })

    describe('with next/link', () => {
      it('should use pushState with same href and different asPath', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/nav/as-path-pushstate')
          await browser
            .elementByCss('#hello')
            .click()
            .waitForElementByCss('#something-hello')
          const queryOne = JSON.parse(
            await browser.elementByCss('#router-query').text()
          )
          expect(queryOne.something).toBe('hello')
          await browser
            .elementByCss('#same-query')
            .click()
            .waitForElementByCss('#something-same-query')
          const queryTwo = JSON.parse(
            await browser.elementByCss('#router-query').text()
          )
          expect(queryTwo.something).toBe('hello')
          await browser.back().waitForElementByCss('#something-hello')
          const queryThree = JSON.parse(
            await browser.elementByCss('#router-query').text()
          )
          expect(queryThree.something).toBe('hello')
          await browser
            .elementByCss('#else')
            .click()
            .waitForElementByCss('#something-else')
          await browser
            .elementByCss('#hello2')
            .click()
            .waitForElementByCss('#nav-as-path-pushstate')
          await browser.back().waitForElementByCss('#something-else')
          const queryFour = JSON.parse(
            await browser.elementByCss('#router-query').text()
          )
          expect(queryFour.something).toBe(undefined)
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      it('should detect asPath query changes correctly', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/nav/as-path-query')
          await browser
            .elementByCss('#hello')
            .click()
            .waitForElementByCss('#something-hello-something-hello')
          const queryOne = JSON.parse(
            await browser.elementByCss('#router-query').text()
          )
          expect(queryOne.something).toBe('hello')
          await browser
            .elementByCss('#hello2')
            .click()
            .waitForElementByCss('#something-hello-something-else')
          const queryTwo = JSON.parse(
            await browser.elementByCss('#router-query').text()
          )
          expect(queryTwo.something).toBe('else')
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })
    })
  })

  describe('runtime errors', () => {
    it('should show redbox when a client side error is thrown inside a component', async () => {
      let browser
      try {
        browser = await webdriver(next.appPort, '/error-inside-browser-page')
        await assertHasRedbox(browser)
        const text = await getRedboxSource(browser)
        expect(text).toMatch(/An Expected error occurred/)
        expect(text).toMatch(/pages[\\/]error-inside-browser-page\.js \(5:13\)/)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should show redbox when a client side error is thrown outside a component', async () => {
      let browser
      try {
        browser = await webdriver(
          next.appPort,
          '/error-in-the-browser-global-scope'
        )
        await assertHasRedbox(browser)
        const text = await getRedboxSource(browser)
        expect(text).toMatch(/An Expected error occurred/)
        expect(text).toMatch(/error-in-the-browser-global-scope\.js \(2:9\)/)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })

  describe('with 404 pages', () => {
    it('should 404 on not existent page', async () => {
      const browser = await webdriver(next.appPort, '/non-existent')
      expect(await browser.elementByCss('h1').text()).toBe('404')
      expect(await browser.elementByCss('h2').text()).toBe(
        'This page could not be found.'
      )
      await browser.close()
    })

    it('should 404 on wrong casing', async () => {
      const browser = await webdriver(next.appPort, '/nAv/AbOuT')
      expect(await browser.elementByCss('h1').text()).toBe('404')
      expect(await browser.elementByCss('h2').text()).toBe(
        'This page could not be found.'
      )
      await browser.close()
    })

    it('should get url dynamic param', async () => {
      const browser = await webdriver(
        next.appPort,
        '/dynamic/dynamic-part/route'
      )
      expect(await browser.elementByCss('p').text()).toBe('dynamic-part')
      await browser.close()
    })

    it('should 404 on wrong casing of url dynamic param', async () => {
      const browser = await webdriver(
        next.appPort,
        '/dynamic/dynamic-part/RoUtE'
      )
      expect(await browser.elementByCss('h1').text()).toBe('404')
      expect(await browser.elementByCss('h2').text()).toBe(
        'This page could not be found.'
      )
      await browser.close()
    })

    it('should not 404 for <page>/', async () => {
      const browser = await webdriver(next.appPort, '/nav/about/')
      const text = await browser.elementByCss('p').text()
      expect(text).toBe('This is the about page.')
      await browser.close()
    })

    it('should should not contain a page script in a 404 page', async () => {
      const browser = await webdriver(next.appPort, '/non-existent')
      const scripts = await browser.elementsByCss('script[src]')
      for (const script of scripts) {
        const src = await script.getAttribute('src')
        expect(src.includes('/non-existent')).toBeFalsy()
      }
      await browser.close()
    })
  })

  describe('foreign history manipulation', () => {
    it('should ignore history state without options', async () => {
      let browser
      try {
        browser = await webdriver(next.appPort, '/nav')
        // push history object without options
        await browser.eval(
          'window.history.pushState({ url: "/whatever" }, "", "/whatever")'
        )
        await browser.elementByCss('#about-link').click()
        await browser.waitForElementByCss('.nav-about')
        await browser.back()
        await waitFor(1000)
        await assertNoRedbox(browser)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should ignore history state with an invalid url', async () => {
      let browser
      try {
        browser = await webdriver(next.appPort, '/nav')
        // push history object wit invalid url (not relative)
        await browser.eval(
          'window.history.pushState({ url: "http://google.com" }, "", "/whatever")'
        )
        await browser.elementByCss('#about-link').click()
        await browser.waitForElementByCss('.nav-about')
        await browser.back()
        await waitFor(1000)
        await assertNoRedbox(browser)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should ignore foreign history state with missing properties', async () => {
      let browser
      try {
        browser = await webdriver(next.appPort, '/nav')
        // push empty history state
        await browser.eval('window.history.pushState({}, "", "/whatever")')
        await browser.elementByCss('#about-link').click()
        await browser.waitForElementByCss('.nav-about')
        await browser.back()
        await waitFor(1000)
        await assertNoRedbox(browser)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })

  it('should not error on module.exports + polyfills', async () => {
    let browser
    try {
      browser = await webdriver(next.appPort, '/read-only-object-error')
      expect(await browser.elementByCss('body').text()).toBe(
        'this is just a placeholder component'
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should work on nested /index/index.js', async () => {
    const browser = await webdriver(next.appPort, '/nested-index/index')
    expect(await browser.elementByCss('p').text()).toBe(
      'This is an index.js nested in an index/ folder.'
    )
    await browser.close()
  })

  it('should handle undefined prop in head client-side', async () => {
    const browser = await webdriver(next.appPort, '/head')
    const value = await browser.eval(
      `document.querySelector('meta[name="empty-content"]').hasAttribute('content')`
    )

    expect(value).toBe(false)
  })

  it.each([true, false])(
    'should handle boolean async prop in next/script client-side: %s',
    async (bool) => {
      const browser = await webdriver(next.appPort, '/script')
      const value = await browser.eval(
        `document.querySelector('script[src="/test-async-${JSON.stringify(
          bool
        )}.js"]').async`
      )

      expect(value).toBe(bool)
    }
  )

  it('should only execute async and defer scripts with next/script once', async () => {
    let browser
    try {
      browser = await webdriver(next.appPort, '/script')

      await browser.waitForElementByCss('h1')
      await waitFor(2000)
      expect(Number(await browser.eval('window.__test_async_executions'))).toBe(
        1
      )
      expect(Number(await browser.eval('window.__test_defer_executions'))).toBe(
        1
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should emit routeChangeError on hash change cancel', async () => {
    const browser = await webdriver(next.appPort, '/')

    await browser.eval(`(function() {
      window.routeErrors = []

      window.next.router.events.on('routeChangeError', function (err) {
        window.routeErrors.push(err)
      })
      window.next.router.push('#first')
      window.next.router.push('#second')
      window.next.router.push('#third')
    })()`)

    await check(async () => {
      const errorCount = await browser.eval('window.routeErrors.length')
      return errorCount > 0 ? 'success' : errorCount
    }, 'success')
  })

  it('should navigate to paths relative to the current page', async () => {
    const browser = await webdriver(next.appPort, '/nav/relative')
    let page

    await browser.elementByCss('a').click()

    await browser.waitForElementByCss('#relative-1')
    page = await browser.elementByCss('body').text()
    expect(page).toMatch(/On relative 1/)
    await browser.elementByCss('a').click()

    await browser.waitForElementByCss('#relative-2')
    page = await browser.elementByCss('body').text()
    expect(page).toMatch(/On relative 2/)

    await browser.elementByCss('button').click()
    await browser.waitForElementByCss('#relative')
    page = await browser.elementByCss('body').text()
    expect(page).toMatch(/On relative index/)

    await browser.close()
  })
})

describe.each([[false], [true]])(
  'updating <Head /> with strictNextHead=%s while client routing',
  (strictNextHead) => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixture'),
      env: {
        TEST_STRICT_NEXT_HEAD: String(strictNextHead),
      },
    })

    it.each([true, false])(
      'should handle boolean async prop in next/head client-side: %s',
      async (bool) => {
        const browser = await webdriver(next.appPort, '/head')
        const value = await browser.eval(
          `document.querySelector('script[src="/test-async-${JSON.stringify(
            bool
          )}.js"]').async`
        )

        expect(value).toBe(bool)
      }
    )

    it('should only execute async and defer scripts once', async () => {
      let browser
      try {
        browser = await webdriver(next.appPort, '/head')

        await browser.waitForElementByCss('h1')
        await waitFor(2000)
        expect(
          Number(await browser.eval('window.__test_async_executions'))
        ).toBe(
          strictNextHead || isReact18
            ? 1
            : // <meta name="next-head-count" /> is floated before <script />.
              // head-manager thinks it needs to add these again resulting in another execution.
              2
        )
        expect(
          Number(await browser.eval('window.__test_defer_executions'))
        ).toBe(
          strictNextHead || isReact18
            ? 1
            : // <meta name="next-head-count" /> is floated before <script defer />.
              // head-manager thinks it needs to add these again resulting in another execution.
              2
        )

        await browser.elementByCss('#reverseScriptOrder').click()
        await waitFor(2000)

        expect(
          Number(await browser.eval('window.__test_async_executions'))
        ).toBe(strictNextHead || isReact18 ? 1 : 2)
        expect(
          Number(await browser.eval('window.__test_defer_executions'))
        ).toBe(strictNextHead || isReact18 ? 1 : 2)

        await browser.elementByCss('#toggleScript').click()
        await waitFor(2000)

        expect(
          Number(await browser.eval('window.__test_async_executions'))
        ).toBe(strictNextHead || isReact18 ? 1 : 2)
        expect(
          Number(await browser.eval('window.__test_defer_executions'))
        ).toBe(strictNextHead || isReact18 ? 1 : 2)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should warn when stylesheets or scripts are in head', async () => {
      let browser
      try {
        browser = await webdriver(next.appPort, '/head')

        await browser.waitForElementByCss('h1')
        await waitFor(1000)
        const browserLogs = await browser.log()
        let foundStyles = false
        let foundScripts = false
        const logs = []
        browserLogs.forEach(({ message }) => {
          if (message.includes('Do not add stylesheets using next/head')) {
            foundStyles = true
            logs.push(message)
          }
          if (message.includes('Do not add <script> tags using next/head')) {
            foundScripts = true
            logs.push(message)
          }
        })

        expect(foundStyles).toEqual(true)
        expect(foundScripts).toEqual(true)

        // Warnings are unique
        expect(logs.length).toEqual(new Set(logs).size)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should warn when scripts are in head', async () => {
      let browser
      try {
        browser = await webdriver(next.appPort, '/head')
        await browser.waitForElementByCss('h1')
        await waitFor(1000)
        const browserLogs = await browser.log()
        let found = false
        browserLogs.forEach((log) => {
          if (log.message.includes('Use next/script instead')) {
            found = true
          }
        })
        expect(found).toEqual(true)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should not warn when application/ld+json scripts are in head', async () => {
      let browser
      try {
        browser = await webdriver(next.appPort, '/head-with-json-ld-snippet')
        await browser.waitForElementByCss('h1')
        await waitFor(1000)
        const browserLogs = await browser.log()
        let found = false
        browserLogs.forEach((log) => {
          if (log.message.includes('Use next/script instead')) {
            found = true
          }
        })
        expect(found).toEqual(false)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should update head during client routing', async () => {
      let browser
      try {
        browser = await webdriver(next.appPort, '/nav/head-1')
        expect(
          await browser
            .elementByCss('meta[name="description"]')
            .getAttribute('content')
        ).toBe('Head One')

        await browser
          .elementByCss('#to-head-2')
          .click()
          .waitForElementByCss('#head-2', 3000)
        expect(
          await browser
            .elementByCss('meta[name="description"]')
            .getAttribute('content')
        ).toBe('Head Two')

        await browser
          .elementByCss('#to-head-1')
          .click()
          .waitForElementByCss('#head-1', 3000)
        expect(
          await browser
            .elementByCss('meta[name="description"]')
            .getAttribute('content')
        ).toBe('Head One')

        await browser
          .elementByCss('#to-head-3')
          .click()
          .waitForElementByCss('#head-3', 3000)
        expect(
          await browser
            .elementByCss('meta[name="description"]')
            .getAttribute('content')
        ).toBe('Head Three')
        expect(await browser.eval('document.title')).toBe('')

        await browser
          .elementByCss('#to-head-1')
          .click()
          .waitForElementByCss('#head-1', 3000)
        expect(
          await browser
            .elementByCss('meta[name="description"]')
            .getAttribute('content')
        ).toBe('Head One')
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should update title during client routing', async () => {
      let browser
      try {
        browser = await webdriver(next.appPort, '/nav/head-1')
        expect(await browser.eval('document.title')).toBe('this is head-1')

        await browser
          .elementByCss('#to-head-2')
          .click()
          .waitForElementByCss('#head-2', 3000)
        expect(await browser.eval('document.title')).toBe('this is head-2')

        await browser
          .elementByCss('#to-head-1')
          .click()
          .waitForElementByCss('#head-1', 3000)
        expect(await browser.eval('document.title')).toBe('this is head-1')
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should update head when unmounting component', async () => {
      let browser
      try {
        browser = await webdriver(next.appPort, '/head-dynamic')
        expect(await browser.eval('document.title')).toBe('B')
        await browser.elementByCss('button').click()
        expect(await browser.eval('document.title')).toBe('A')
        await browser.elementByCss('button').click()
        expect(await browser.eval('document.title')).toBe('B')
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  }
)
