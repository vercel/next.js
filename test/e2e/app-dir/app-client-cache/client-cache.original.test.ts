import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { Playwright } from 'next-webdriver'
import {
  browserConfigWithFixedTime,
  createRequestsListener,
  fastForwardTo,
  getPathname,
} from './test-utils'
import path from 'path'

// This preserves existing tests for the 30s/5min heuristic (previous router defaults)
describe('app dir client cache semantics (30s/5min)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'regular'),
    nextConfig: {
      experimental: { staleTimes: { dynamic: 30, static: 180 } },
    },
  })

  if (isNextDev) {
    // dev doesn't support prefetch={true}, so this just performs a basic test to make sure data is reused for 30s
    it('should renew the 30s cache once the data is revalidated', async () => {
      let browser = await next.browser('/', browserConfigWithFixedTime)

      // navigate to prefetch-auto page
      await browser.elementByCss('[href="/1"]').click()
      await browser.waitForElementByCss('#random-number')

      let initialNumber = await browser.elementById('random-number').text()

      // Navigate back to the index, and then back to the prefetch-auto page
      await browser.elementByCss('[href="/"]').click()
      await browser.waitForElementByCss('[href="/1"]')
      await browser.eval(fastForwardTo, 5 * 1000)
      await browser.elementByCss('[href="/1"]').click()
      await browser.waitForElementByCss('#random-number')

      let newNumber = await browser.elementById('random-number').text()

      // the number should be the same, as we navigated within 30s.
      expect(newNumber).toBe(initialNumber)

      // Fast forward to expire the cache
      await browser.eval(fastForwardTo, 30 * 1000)

      // Navigate back to the index, and then back to the prefetch-auto page
      await browser.elementByCss('[href="/"]').click()
      await browser.waitForElementByCss('[href="/1"]')
      await browser.elementByCss('[href="/1"]').click()
      await browser.waitForElementByCss('#random-number')

      newNumber = await browser.elementById('random-number').text()

      // ~35s have passed, so the cache should be expired and the number should be different
      expect(newNumber).not.toBe(initialNumber)

      // once the number is updated, we should have a renewed 30s cache for this entry
      // store this new number so we can check that it stays the same
      initialNumber = newNumber

      await browser.eval(fastForwardTo, 5 * 1000)

      // Navigate back to the index, and then back to the prefetch-auto page
      await browser.elementByCss('[href="/"]').click()
      await browser.waitForElementByCss('[href="/1"]')
      await browser.elementByCss('[href="/1"]').click()
      await browser.waitForElementByCss('#random-number')

      newNumber = await browser.elementById('random-number').text()

      // the number should be the same, as we navigated within 30s (part 2).
      expect(newNumber).toBe(initialNumber)
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
        await retry(() => {
          expect(
            getRequests().some(
              ([url, didPartialPrefetch]) =>
                getPathname(url) === '/0' && !didPartialPrefetch
            )
          ).toBe(true)
        })

        clearRequests()

        await browser.elementByCss('[href="/0?timeout=0"]').click()
        await browser.waitForElementByCss('#random-number')

        await retry(() => {
          const requests = getRequests()
          expect(requests.every(([url]) => getPathname(url) !== '/0')).toBe(
            true
          )
        })
      })
      it('should re-use the cache for the full page, only for 5 mins', async () => {
        await browser.elementByCss('[href="/0?timeout=0"]').click()
        await browser.waitForElementByCss('#random-number')
        const randomNumber = await browser.elementById('random-number').text()

        await browser.elementByCss('[href="/"]').click()
        await browser.waitForElementByCss('[href="/0?timeout=0"]')

        await browser.elementByCss('[href="/0?timeout=0"]').click()
        await browser.waitForElementByCss('#random-number')
        const number = await browser.elementById('random-number').text()

        expect(number).toBe(randomNumber)

        await browser.eval(fastForwardTo, 5 * 60 * 1000)

        await browser.elementByCss('[href="/"]').click()
        await browser.waitForElementByCss('[href="/0?timeout=0"]')

        await browser.elementByCss('[href="/0?timeout=0"]').click()
        await browser.waitForElementByCss('#random-number')
        const newNumber = await browser.elementById('random-number').text()

        expect(newNumber).not.toBe(randomNumber)
      })

      it('should prefetch again after 5 mins if the link is visible again', async () => {
        const { getRequests, clearRequests } =
          await createRequestsListener(browser)

        await retry(() => {
          expect(
            getRequests().some(
              ([url, didPartialPrefetch]) =>
                getPathname(url) === '/0' && !didPartialPrefetch
            )
          ).toBe(true)
        })

        await browser.elementByCss('[href="/0?timeout=0"]').click()
        await browser.waitForElementByCss('#random-number')
        const randomNumber = await browser.elementById('random-number').text()

        await browser.eval(fastForwardTo, 5 * 60 * 1000)
        clearRequests()

        await browser.elementByCss('[href="/"]').click()
        await browser.waitForElementByCss('[href="/0?timeout=0"]')

        await retry(() => {
          expect(
            getRequests().some(
              ([url, didPartialPrefetch]) =>
                getPathname(url) === '/0' && !didPartialPrefetch
            )
          ).toBe(true)
        })

        await browser.elementByCss('[href="/0?timeout=0"]').click()
        await browser.waitForElementByCss('#random-number')
        const number = await browser.elementById('random-number').text()

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

        await browser.elementByCss('[href="/2"]').click()
        await browser.waitForElementByCss('#random-number')

        await retry(() => {
          const requests = getRequests().filter(
            ([url]) => getPathname(url) === '/2'
          )
          expect(requests.length).toBe(1)
        })

        expect(
          getRequests().some(
            ([url, didPartialPrefetch]) =>
              getPathname(url) === '/2' && didPartialPrefetch
          )
        ).toBe(false)
      })
      it('should re-use the cache only for 30 seconds', async () => {
        await browser.elementByCss('[href="/2"]').click()
        await browser.waitForElementByCss('#random-number')
        const randomNumber = await browser.elementById('random-number').text()

        await browser.elementByCss('[href="/"]').click()
        await browser.waitForElementByCss('[href="/2"]')

        await browser.elementByCss('[href="/2"]').click()
        await browser.waitForElementByCss('#random-number')
        const number = await browser.elementById('random-number').text()

        expect(number).toBe(randomNumber)

        await browser.eval(fastForwardTo, 30 * 1000)

        await browser.elementByCss('[href="/"]').click()
        await browser.waitForElementByCss('[href="/2"]')

        await browser.elementByCss('[href="/2"]').click()
        await browser.waitForElementByCss('#random-number')
        const newNumber = await browser.elementById('random-number').text()

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

        await retry(() => {
          expect(
            getRequests().some(
              ([url, didPartialPrefetch]) =>
                getPathname(url) === '/1' && didPartialPrefetch
            )
          ).toBe(true)
        })

        clearRequests()

        await browser.elementByCss('[href="/1"]').click()
        await browser.waitForElementByCss('#random-number')

        await retry(() => {
          expect(
            getRequests().some(
              ([url, didPartialPrefetch]) =>
                getPathname(url) === '/1' && !didPartialPrefetch
            )
          ).toBe(true)
        })
      })
      it('should re-use the full cache for only 30 seconds', async () => {
        await browser.elementByCss('[href="/1"]').click()
        await browser.waitForElementByCss('#random-number')
        const randomNumber = await browser.elementById('random-number').text()

        await browser.elementByCss('[href="/"]').click()
        await browser.waitForElementByCss('[href="/1"]')

        await browser.elementByCss('[href="/1"]').click()
        await browser.waitForElementByCss('#random-number')
        const number = await browser.elementById('random-number').text()

        expect(number).toBe(randomNumber)

        await browser.eval(fastForwardTo, 5 * 1000)

        await browser.elementByCss('[href="/"]').click()
        await browser.waitForElementByCss('[href="/1"]')

        await browser.elementByCss('[href="/1"]').click()
        await browser.waitForElementByCss('#random-number')
        const newNumber = await browser.elementById('random-number').text()

        expect(newNumber).toBe(randomNumber)

        await browser.eval(fastForwardTo, 30 * 1000)

        await browser.elementByCss('[href="/"]').click()
        await browser.waitForElementByCss('[href="/1"]')

        await browser.elementByCss('[href="/1"]').click()
        await browser.waitForElementByCss('#random-number')
        const newNumber2 = await browser.elementById('random-number').text()

        expect(newNumber2).not.toBe(newNumber)
      })

      it('should renew the 30s cache once the data is revalidated', async () => {
        // navigate to prefetch-auto page
        await browser.elementByCss('[href="/1"]').click()
        await browser.waitForElementByCss('#random-number')

        let initialNumber = await browser.elementById('random-number').text()

        // Navigate back to the index, and then back to the prefetch-auto page
        await browser.elementByCss('[href="/"]').click()
        await browser.waitForElementByCss('[href="/1"]')
        await browser.eval(fastForwardTo, 5 * 1000)
        await browser.elementByCss('[href="/1"]').click()
        await browser.waitForElementByCss('#random-number')

        let newNumber = await browser.elementById('random-number').text()

        // the number should be the same, as we navigated within 30s.
        expect(newNumber).toBe(initialNumber)

        // Fast forward to expire the cache
        await browser.eval(fastForwardTo, 30 * 1000)

        // Navigate back to the index, and then back to the prefetch-auto page
        await browser.elementByCss('[href="/"]').click()
        await browser.waitForElementByCss('[href="/1"]')
        await browser.elementByCss('[href="/1"]').click()
        await browser.waitForElementByCss('#random-number')

        newNumber = await browser.elementById('random-number').text()

        // ~35s have passed, so the cache should be expired and the number should be different
        expect(newNumber).not.toBe(initialNumber)

        // once the number is updated, we should have a renewed 30s cache for this entry
        // store this new number so we can check that it stays the same
        initialNumber = newNumber

        await browser.eval(fastForwardTo, 5 * 1000)

        // Navigate back to the index, and then back to the prefetch-auto page
        await browser.elementByCss('[href="/"]').click()
        await browser.waitForElementByCss('[href="/1"]')
        await browser.elementByCss('[href="/1"]').click()
        await browser.waitForElementByCss('#random-number')

        newNumber = await browser.elementById('random-number').text()

        // the number should be the same, as we navigated within 30s (part 2).
        expect(newNumber).toBe(initialNumber)
      })

      it('should refetch below the fold after 30 seconds', async () => {
        await browser.elementByCss('[href="/1?timeout=1000"]').click()
        await browser.waitForElementByCss('#random-number')
        const randomNumber = await browser.elementById('random-number').text()

        await browser.elementByCss('[href="/"]').click()
        await browser.waitForElementByCss('[href="/1?timeout=1000"]')

        await browser.eval(fastForwardTo, 30 * 1000)

        await browser.elementByCss('[href="/1?timeout=1000"]').click()
        await browser.waitForElementByCss('#random-number')
        const newNumber = await browser.elementById('random-number').text()

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

    it('should seed the prefetch cache with the fetched page data', async () => {
      const browser = await next.browser('/1', browserConfigWithFixedTime)

      await browser.waitForElementByCss('#random-number')
      const initialNumber = await browser.elementById('random-number').text()

      // Move forward a few seconds, navigate off the page and then back to it
      await browser.eval(fastForwardTo, 5 * 1000)
      await browser.elementByCss('[href="/"]').click()
      await browser.waitForElementByCss('[href="/1"]')

      await browser.waitForIdleNetwork()

      await browser.elementByCss('[href="/1"]').click()
      await browser.waitForElementByCss('#random-number')

      const newNumber = await browser.elementById('random-number').text()

      // The number should be the same as we've seeded it in the prefetch cache when we loaded the full page
      expect(newNumber).toBe(initialNumber)
    })

    it('should renew the initial seeded data after expiration time', async () => {
      const browser = await next.browser(
        '/without-loading/1',
        browserConfigWithFixedTime
      )

      await browser.waitForElementByCss('#random-number')
      const initialNumber = await browser.elementById('random-number').text()

      // Expire the cache
      await browser.eval(fastForwardTo, 30 * 1000)
      await browser.elementByCss('[href="/without-loading"]').click()
      await browser.waitForElementByCss('[href="/without-loading/1"]')
      await browser.elementByCss('[href="/without-loading/1"]').click()
      await browser.waitForElementByCss('#random-number')

      const newNumber = await browser.elementById('random-number').text()

      // The number should be different, as the seeded data has expired after 30s
      expect(newNumber).not.toBe(initialNumber)
    })
  }
})
