/* eslint-env jest */

import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Client navigation with URL hash', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
    env: {
      TEST_STRICT_NEXT_HEAD: String(true),
    },
  })

  describe('when hash changes', () => {
    describe('check hydration mis-match', () => {
      it('should not have hydration mis-match for hash link', async () => {
        const browser = await next.browser('/nav/hash-changes')
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
        const browser = await next.browser('/nav/hash-changes')

        await browser.elementByCss('#via-link').click()

        await retry(async () => {
          expect(await browser.elementByCss('p').text()).toBe('COUNT: 0')
        })

        await browser.close()
      })

      it('should scroll to the specified position on the same page', async () => {
        const browser = await next.browser('/nav/hash-changes')

        // Scrolls to item 400 on the page
        await browser.elementByCss('#scroll-to-item-400').click()

        await retry(async () => {
          expect(await browser.eval('window.pageYOffset')).toBe(7258)
        })

        // Scrolls back to top when scrolling to `#` with no value.
        await browser.elementByCss('#via-empty-hash').click()

        await retry(async () => {
          expect(await browser.eval('window.pageYOffset')).toBe(0)
        })

        // Scrolls to item 400 on the page
        await browser.elementByCss('#scroll-to-item-400').click()

        await retry(async () => {
          expect(await browser.eval('window.pageYOffset')).toBe(7258)
        })

        // Scrolls back to top when clicking link with href `#top`.
        await browser.elementByCss('#via-top-hash').click()

        await retry(async () => {
          expect(await browser.eval('window.pageYOffset')).toBe(0)
        })

        // Scrolls to cjk anchor on the page
        await browser.elementByCss('#scroll-to-cjk-anchor').click()

        await retry(async () => {
          expect(await browser.eval('window.pageYOffset')).toBe(17436)
        })
      })

      it('should not scroll to hash when scroll={false} is set', async () => {
        const browser = await next.browser('/nav/hash-changes')
        const curScroll = await browser.eval(
          'document.documentElement.scrollTop'
        )
        await browser.elementByCss('#scroll-to-name-item-400-no-scroll').click()

        await retry(async () => {
          expect(await browser.eval('document.documentElement.scrollTop')).toBe(
            curScroll
          )
        })
      })

      it('should scroll to the specified position on the same page with a name property', async () => {
        const browser = await next.browser('/nav/hash-changes')

        // Scrolls to item 400 with name="name-item-400" on the page
        await browser.elementByCss('#scroll-to-name-item-400').click()

        await retry(async () => {
          expect(await browser.eval('window.pageYOffset')).toBe(16258)
        })

        // Scrolls back to top when scrolling to `#` with no value.
        await browser.elementByCss('#via-empty-hash').click()

        await retry(async () => {
          expect(await browser.eval('window.pageYOffset')).toBe(0)
        })
      })

      it('should scroll to the specified position to a new page', async () => {
        const browser = await next.browser('/nav')

        // Scrolls to item 400 on the page
        await browser
          .elementByCss('#scroll-to-hash')
          .click()
          .waitForElementByCss('#hash-changes-page')

        await retry(async () => {
          expect(await browser.eval('window.pageYOffset')).toBe(7258)
        })
      })

      it('should scroll to the specified CJK position to a new page', async () => {
        const browser = await next.browser('/nav')

        // Scrolls to CJK anchor on the page
        await browser
          .elementByCss('#scroll-to-cjk-hash')
          .click()
          .waitForElementByCss('#hash-changes-page')

        await retry(async () => {
          expect(await browser.eval('window.pageYOffset')).toBe(17436)
        })
      })

      it('Should update asPath', async () => {
        const browser = await next.browser('/nav/hash-changes')

        await browser.elementByCss('#via-link').click()

        await retry(async () => {
          expect(await browser.elementByCss('div#asPath').text()).toBe(
            'ASPATH: /nav/hash-changes#via-link'
          )
        })
      })
    })

    describe('when hash change via A tag', () => {
      it('should not run getInitialProps', async () => {
        const browser = await next.browser('/nav/hash-changes')

        await browser.elementByCss('#via-a').click()

        await retry(async () => {
          expect(await browser.elementByCss('p').text()).toBe('COUNT: 0')
        })

        await browser.close()
      })
    })

    describe('when hash get removed', () => {
      it('should not run getInitialProps', async () => {
        const browser = await next.browser('/nav/hash-changes')

        await browser
          .elementByCss('#via-a')
          .click()
          .elementByCss('#page-url')
          .click()

        await retry(async () => {
          expect(await browser.elementByCss('p').text()).toBe('COUNT: 1')
        })

        await browser.close()
      })

      it('should not run getInitialProps when removing via back', async () => {
        const browser = await next.browser('/nav/hash-changes')

        await browser.elementByCss('#scroll-to-item-400').click()
        await browser.back()

        await retry(async () => {
          expect(await browser.elementByCss('p').text()).toBe('COUNT: 0')
        })

        await browser.close()
      })
    })

    describe('when hash set to empty', () => {
      it('should not run getInitialProps', async () => {
        const browser = await next.browser('/nav/hash-changes')

        await browser
          .elementByCss('#via-a')
          .click()
          .elementByCss('#via-empty-hash')
          .click()

        await retry(async () => {
          expect(await browser.elementByCss('p').text()).toBe('COUNT: 0')
        })

        await browser.close()
      })
    })
  })

  describe('when hash changes with state', () => {
    describe('when passing state via hash change', () => {
      it('should increment the history state counter', async () => {
        const browser = await next.browser('/nav/hash-changes-with-state#')

        await browser
          .elementByCss('#increment-history-count')
          .click()
          .elementByCss('#increment-history-count')
          .click()

        await retry(async () => {
          expect(await browser.elementByCss('div#history-count').text()).toBe(
            'HISTORY COUNT: 2'
          )
        })

        const counter = await browser.elementByCss('p').text()

        // getInitialProps should not be called with only hash changes
        expect(counter).toBe('COUNT: 0')

        await browser.close()
      })

      it('should increment the shallow history state counter', async () => {
        const browser = await next.browser('/nav/hash-changes-with-state#')

        await browser
          .elementByCss('#increment-shallow-history-count')
          .click()
          .elementByCss('#increment-shallow-history-count')
          .click()

        await retry(async () => {
          expect(
            await browser.elementByCss('div#shallow-history-count').text()
          ).toBe('SHALLOW HISTORY COUNT: 2')
        })

        const counter = await browser.elementByCss('p').text()

        expect(counter).toBe('COUNT: 0')

        await browser.close()
      })
    })
  })
})
