import { nextTestSetup } from 'e2e-utils'
import { check, retry } from 'next-test-utils'
import { Playwright } from 'next-webdriver'
import {
  browserConfigWithFixedTime,
  createRequestsListener,
  fastForwardTo,
  getPathname,
} from './test-utils'
import path from 'path'

describe('app dir client cache semantics (default semantics)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'regular'),
  })

  if (isNextDev) {
    // dev doesn't support prefetch={true}, so this just performs a basic test to make sure data is reused for 30s
    it('should return fresh data every navigation', async () => {
      let browser = await next.browser('/', browserConfigWithFixedTime)

      // navigate to prefetch-auto page
      await browser.elementByCss('[href="/1"]').click()

      let initialNumber = await browser.elementById('random-number').text()

      // Navigate back to the index, and then back to the prefetch-auto page
      await browser.elementByCss('[href="/"]').click()
      await browser.eval(fastForwardTo, 5 * 1000)
      await browser.elementByCss('[href="/1"]').click()

      let newNumber = await browser.elementById('random-number').text()

      expect(newNumber).not.toBe(initialNumber)
    })
  } else {
    describe('prefetch={true}', () => {
      let browser: Playwright

      beforeEach(async () => {
        browser = await next.browser('/', browserConfigWithFixedTime)
      })

      it('should prefetch the full page', async () => {
        const { getRequests, clearRequests } =
          await createRequestsListener(browser)
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
        const { getRequests, clearRequests } =
          await createRequestsListener(browser)

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
      let browser: Playwright

      beforeEach(async () => {
        browser = await next.browser('/', browserConfigWithFixedTime)
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
      it('should not re-use the page segment cache', async () => {
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

        expect(number).not.toBe(randomNumber)

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
      let browser: Playwright

      beforeEach(async () => {
        browser = await next.browser('/', browserConfigWithFixedTime)
      })

      it('should prefetch partially a dynamic page', async () => {
        const { getRequests, clearRequests } =
          await createRequestsListener(browser)

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
      it('should not re-use the page segment cache', async () => {
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

        expect(number).not.toBe(randomNumber)

        await browser.eval(fastForwardTo, 5 * 1000)

        await browser.elementByCss('[href="/"]').click()

        const newNumber = await browser
          .elementByCss('[href="/1"]')
          .click()
          .waitForElementByCss('#random-number')
          .text()

        expect(newNumber).not.toBe(randomNumber)

        await browser.eval(fastForwardTo, 30 * 1000)

        await browser.elementByCss('[href="/"]').click()

        const newNumber2 = await browser
          .elementByCss('[href="/1"]')
          .click()
          .waitForElementByCss('#random-number')
          .text()

        expect(newNumber2).not.toBe(newNumber)
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
        await retry(async () => {
          expect(
            await browser.hasElementByCssSelector('[href="/null-loading"]')
          ).toBe(false)
        })

        // the root layout should still be visible
        expect(await browser.hasElementByCssSelector('#root-layout')).toBe(true)

        // the dynamic content should eventually appear
        await browser.waitForElementByCss('#random-number')
        expect(await browser.hasElementByCssSelector('#random-number')).toBe(
          true
        )
      })
    })

    it('should renew the initial seeded data after expiration time', async () => {
      const browser = await next.browser(
        '/without-loading/1',
        browserConfigWithFixedTime
      )

      const initialNumber = await browser.elementById('random-number').text()

      // Expire the cache
      await browser.eval(fastForwardTo, 30 * 1000)
      await browser.elementByCss('[href="/without-loading"]').click()
      await browser.elementByCss('[href="/without-loading/1"]').click()

      const newNumber = await browser.elementById('random-number').text()

      // The number should be different, as the seeded data has expired after 30s
      expect(newNumber).not.toBe(initialNumber)
    })
  }
})
