import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'
import { BrowserInterface } from 'test/lib/browsers/base'
import {
  browserConfigWithFixedTime,
  createRequestsListener,
  fastForwardTo,
  getPathname,
} from './test-utils'

createNextDescribe(
  'app dir client cache semantics',
  {
    files: __dirname,
  },
  ({ next, isNextDev }) => {
    if (isNextDev) {
      // since the router behavior is different in development mode (no viewport prefetching + liberal revalidation)
      // we only check the production behavior
      it('should skip dev', () => {})
    } else {
      describe('prefetch={true}', () => {
        let browser: BrowserInterface

        beforeEach(async () => {
          browser = (await next.browser(
            '/',
            browserConfigWithFixedTime
          )) as BrowserInterface
        })

        it('should prefetch the full page', async () => {
          const { getRequests, clearRequests } = await createRequestsListener(
            browser
          )
          await check(() => {
            return getRequests().some(
              ([url, didPartialPrefetch]) =>
                getPathname(url) === '/0' && !didPartialPrefetch
            )
              ? 'success'
              : 'fail'
          }, 'success')

          clearRequests()

          await browser
            .elementByCss('[href="/0?timeout=0"]')
            .click()
            .waitForElementByCss('#random-number')

          expect(
            getRequests().every(([url]) => getPathname(url) !== '/0')
          ).toEqual(true)
        })
        it('should re-use the cache for the full page, only for 5 mins', async () => {
          const randomNumber = await browser
            .elementByCss('[href="/0?timeout=0"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          await browser.elementByCss('[href="/"]').click()

          const number = await browser
            .elementByCss('[href="/0?timeout=0"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          expect(number).toBe(randomNumber)

          await browser.eval(fastForwardTo, 5 * 60 * 1000)

          await browser.elementByCss('[href="/"]').click()

          const newNumber = await browser
            .elementByCss('[href="/0?timeout=0"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          expect(newNumber).not.toBe(randomNumber)
        })

        it('should prefetch again after 5 mins if the link is visible again', async () => {
          const { getRequests, clearRequests } = await createRequestsListener(
            browser
          )

          await check(() => {
            return getRequests().some(
              ([url, didPartialPrefetch]) =>
                getPathname(url) === '/0' && !didPartialPrefetch
            )
              ? 'success'
              : 'fail'
          }, 'success')

          const randomNumber = await browser
            .elementByCss('[href="/0?timeout=0"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          await browser.eval(fastForwardTo, 5 * 60 * 1000)
          clearRequests()

          await browser.elementByCss('[href="/"]').click()

          await check(() => {
            return getRequests().some(
              ([url, didPartialPrefetch]) =>
                getPathname(url) === '/0' && !didPartialPrefetch
            )
              ? 'success'
              : 'fail'
          }, 'success')

          const number = await browser
            .elementByCss('[href="/0?timeout=0"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          expect(number).not.toBe(randomNumber)
        })
      })
      describe('prefetch={false}', () => {
        let browser: BrowserInterface

        beforeEach(async () => {
          browser = (await next.browser(
            '/',
            browserConfigWithFixedTime
          )) as BrowserInterface
        })
        it('should not prefetch the page at all', async () => {
          const { getRequests } = await createRequestsListener(browser)

          await browser
            .elementByCss('[href="/2"]')
            .click()
            .waitForElementByCss('#random-number')

          expect(
            getRequests().filter(([url]) => getPathname(url) === '/2')
          ).toHaveLength(1)

          expect(
            getRequests().some(
              ([url, didPartialPrefetch]) =>
                getPathname(url) === '/2' && didPartialPrefetch
            )
          ).toBe(false)
        })
        it('should re-use the cache only for 30 seconds', async () => {
          const randomNumber = await browser
            .elementByCss('[href="/2"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          await browser.elementByCss('[href="/"]').click()

          const number = await browser
            .elementByCss('[href="/2"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          expect(number).toBe(randomNumber)

          await browser.eval(fastForwardTo, 30 * 1000)

          await browser.elementByCss('[href="/"]').click()

          const newNumber = await browser
            .elementByCss('[href="/2"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          expect(newNumber).not.toBe(randomNumber)
        })
      })
      describe('prefetch={undefined} - default', () => {
        let browser: BrowserInterface

        beforeEach(async () => {
          browser = (await next.browser(
            '/',
            browserConfigWithFixedTime
          )) as BrowserInterface
        })

        it('should prefetch partially a dynamic page', async () => {
          const { getRequests, clearRequests } = await createRequestsListener(
            browser
          )

          await check(() => {
            return getRequests().some(
              ([url, didPartialPrefetch]) =>
                getPathname(url) === '/1' && didPartialPrefetch
            )
              ? 'success'
              : 'fail'
          }, 'success')

          clearRequests()

          await browser
            .elementByCss('[href="/1"]')
            .click()
            .waitForElementByCss('#random-number')

          expect(
            getRequests().some(
              ([url, didPartialPrefetch]) =>
                getPathname(url) === '/1' && !didPartialPrefetch
            )
          ).toBe(true)
        })
        it('should re-use the full cache for only 30 seconds', async () => {
          const randomNumber = await browser
            .elementByCss('[href="/1"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          await browser.elementByCss('[href="/"]').click()

          const number = await browser
            .elementByCss('[href="/1"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          expect(number).toBe(randomNumber)

          await browser.eval(fastForwardTo, 5 * 1000)

          await browser.elementByCss('[href="/"]').click()

          const newNumber = await browser
            .elementByCss('[href="/1"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          expect(newNumber).toBe(randomNumber)

          await browser.eval(fastForwardTo, 30 * 1000)

          await browser.elementByCss('[href="/"]').click()

          const newNumber2 = await browser
            .elementByCss('[href="/1"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          expect(newNumber2).not.toBe(newNumber)
        })

        it('should renew the 30s cache once the data is revalidated', async () => {
          // navigate to prefetch-auto page
          await browser.elementByCss('[href="/1"]').click()

          let initialNumber = await browser.elementById('random-number').text()

          // Navigate back to the index, and then back to the prefetch-auto page
          await browser.elementByCss('[href="/"]').click()
          await browser.eval(fastForwardTo, 5 * 1000)
          await browser.elementByCss('[href="/1"]').click()

          let newNumber = await browser.elementById('random-number').text()

          // the number should be the same, as we navigated within 30s.
          expect(newNumber).toBe(initialNumber)

          // Fast forward to expire the cache
          await browser.eval(fastForwardTo, 30 * 1000)

          // Navigate back to the index, and then back to the prefetch-auto page
          await browser.elementByCss('[href="/"]').click()
          await browser.elementByCss('[href="/1"]').click()

          newNumber = await browser.elementById('random-number').text()

          // ~35s have passed, so the cache should be expired and the number should be different
          expect(newNumber).not.toBe(initialNumber)

          // once the number is updated, we should have a renewed 30s cache for this entry
          // store this new number so we can check that it stays the same
          initialNumber = newNumber

          await browser.eval(fastForwardTo, 5 * 1000)

          // Navigate back to the index, and then back to the prefetch-auto page
          await browser.elementByCss('[href="/"]').click()
          await browser.elementByCss('[href="/1"]').click()

          newNumber = await browser.elementById('random-number').text()

          // the number should be the same, as we navigated within 30s (part 2).
          expect(newNumber).toBe(initialNumber)
        })

        it('should refetch below the fold after 30 seconds', async () => {
          const randomLoadingNumber = await browser
            .elementByCss('[href="/1?timeout=1000"]')
            .click()
            .waitForElementByCss('#loading')
            .text()

          const randomNumber = await browser
            .waitForElementByCss('#random-number')
            .text()

          await browser.elementByCss('[href="/"]').click()

          await browser.eval(fastForwardTo, 30 * 1000)

          const newLoadingNumber = await browser
            .elementByCss('[href="/1?timeout=1000"]')
            .click()
            .waitForElementByCss('#loading')
            .text()

          const newNumber = await browser
            .waitForElementByCss('#random-number')
            .text()

          expect(newLoadingNumber).toBe(randomLoadingNumber)

          expect(newNumber).not.toBe(randomNumber)
        })
        it('should refetch the full page after 5 mins', async () => {
          const randomLoadingNumber = await browser
            .elementByCss('[href="/1?timeout=1000"]')
            .click()
            .waitForElementByCss('#loading')
            .text()

          const randomNumber = await browser
            .waitForElementByCss('#random-number')
            .text()

          await browser.eval(fastForwardTo, 5 * 60 * 1000)

          await browser
            .elementByCss('[href="/"]')
            .click()
            .waitForElementByCss('[href="/1?timeout=1000"]')

          const newLoadingNumber = await browser
            .elementByCss('[href="/1?timeout=1000"]')
            .click()
            .waitForElementByCss('#loading')
            .text()

          const newNumber = await browser
            .waitForElementByCss('#random-number')
            .text()

          expect(newLoadingNumber).not.toBe(randomLoadingNumber)

          expect(newNumber).not.toBe(randomNumber)
        })

        it('should respect a loading boundary that returns `null`', async () => {
          await browser.elementByCss('[href="/null-loading"]').click()

          // the page content should disappear immediately
          expect(
            await browser.hasElementByCssSelector('[href="/null-loading"]')
          ).toBeFalse()

          // the root layout should still be visible
          expect(
            await browser.hasElementByCssSelector('#root-layout')
          ).toBeTrue()

          // the dynamic content should eventually appear
          await browser.waitForElementByCss('#random-number')
          expect(
            await browser.hasElementByCssSelector('#random-number')
          ).toBeTrue()
        })
      })
      it('should seed the prefetch cache with the fetched page data', async () => {
        const browser = (await next.browser(
          '/1',
          browserConfigWithFixedTime
        )) as BrowserInterface

        const initialNumber = await browser.elementById('random-number').text()

        // Move forward a few seconds, navigate off the page and then back to it
        await browser.eval(fastForwardTo, 5 * 1000)
        await browser.elementByCss('[href="/"]').click()
        await browser.elementByCss('[href="/1"]').click()

        const newNumber = await browser.elementById('random-number').text()

        // The number should be the same as we've seeded it in the prefetch cache when we loaded the full page
        expect(newNumber).toBe(initialNumber)
      })
    }
  }
)
