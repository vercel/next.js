import { nextTestSetup } from 'e2e-utils'
import { browserConfigWithFixedTime, fastForwardTo } from './test-utils'
import { runTests } from './client-cache.test'

describe('app dir client cache semantics (experimental clientRouterCache)', () => {
  describe('clientRouterCache = live', () => {
    const { next, isNextDev } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        experimental: { clientRouterCacheMode: 'live' },
      },
    })

    if (isNextDev) {
      // since the router behavior is different in development mode (no viewport prefetching + liberal revalidation)
      // we only check the production behavior
      it('should skip dev', () => {})
      return
    }

    describe('prefetch={true}', () => {
      it('should re-use the cache for 5 minutes', async () => {
        const browser = await next.browser('/', browserConfigWithFixedTime)

        let initialRandomNumber = await browser
          .elementByCss('[href="/0?timeout=0"]')
          .click()
          .waitForElementByCss('#random-number')
          .text()

        await browser.elementByCss('[href="/"]').click()

        let newRandomNumber = await browser
          .elementByCss('[href="/0?timeout=0"]')
          .click()
          .waitForElementByCss('#random-number')
          .text()

        expect(initialRandomNumber).toBe(newRandomNumber)

        await browser.eval(fastForwardTo, 30 * 1000) // fast forward 30 seconds

        await browser.elementByCss('[href="/"]').click()

        newRandomNumber = await browser
          .elementByCss('[href="/0?timeout=0"]')
          .click()
          .waitForElementByCss('#random-number')
          .text()

        expect(initialRandomNumber).toBe(newRandomNumber)

        await browser.eval(fastForwardTo, 5 * 60 * 1000) // fast forward 5 minutes

        await browser.elementByCss('[href="/"]').click()

        newRandomNumber = await browser
          .elementByCss('[href="/0?timeout=0"]')
          .click()
          .waitForElementByCss('#random-number')
          .text()

        expect(initialRandomNumber).not.toBe(newRandomNumber)
      })
    })

    describe('prefetch={false}', () => {
      it('should trigger a loading state before fetching the page, followed by fresh data on every subsequent navigation', async () => {
        const browser = await next.browser('/', browserConfigWithFixedTime)

        // this test introduces an artificial delay in rendering the requested page, so we verify a loading state is rendered
        await browser
          .elementByCss('[href="/2?timeout=1000"]')
          .click()
          .waitForElementByCss('#loading')

        const initialRandomNumber = await browser
          .waitForElementByCss('#random-number')
          .text()

        await browser.elementByCss('[href="/"]').click()

        await browser.eval(fastForwardTo, 5 * 1000) // fast forward 5 seconds

        const newRandomNumber = await browser
          .elementByCss('[href="/2?timeout=1000"]')
          .click()
          .waitForElementByCss('#random-number')
          .text()

        expect(initialRandomNumber).not.toBe(newRandomNumber)
      })

      describe('without a loading boundary', () => {
        it('should get fresh data on every subsequent navigation', async () => {
          const browser = await next.browser('/', browserConfigWithFixedTime)

          const initialRandomNumber = await browser
            .elementByCss('[href="/2?timeout=1000"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          await browser.elementByCss('[href="/"]').click()

          await browser.eval(fastForwardTo, 5 * 1000) // fast forward 5 seconds

          const newRandomNumber = await browser
            .elementByCss('[href="/2?timeout=1000"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          expect(initialRandomNumber).not.toBe(newRandomNumber)
        })
      })
    })

    describe('prefetch={undefined} - default', () => {
      it('should trigger a loading state before fetching the page, followed by fresh data on every subsequent navigation', async () => {
        const browser = await next.browser('/', browserConfigWithFixedTime)

        // this test introduces an artificial delay in rendering the requested page, so we verify a loading state is rendered
        await browser
          .elementByCss('[href="/1?timeout=1000"]')
          .click()
          .waitForElementByCss('#loading')

        const initialRandomNumber = await browser
          .waitForElementByCss('#random-number')
          .text()

        await browser.elementByCss('[href="/"]').click()

        await browser.eval(fastForwardTo, 5 * 1000) // fast forward 5 seconds

        const newRandomNumber = await browser
          .elementByCss('[href="/1?timeout=1000"]')
          .click()
          .waitForElementByCss('#random-number')
          .text()

        expect(initialRandomNumber).not.toBe(newRandomNumber)
      })

      describe('without a loading boundary', () => {
        it('should get fresh data on every subsequent navigation', async () => {
          const browser = await next.browser(
            '/without-loading',
            browserConfigWithFixedTime
          )

          const initialRandomNumber = await browser
            .elementByCss('[href="/without-loading/1?timeout=1000"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          await browser.elementByCss('[href="/without-loading"]').click()

          const newRandomNumber = await browser
            .elementByCss('[href="/without-loading/1?timeout=1000"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          expect(initialRandomNumber).not.toBe(newRandomNumber)
        })
      })
    })
  })

  describe('clientRouterCache = default', () => {
    const { next, isNextDev } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        experimental: { clientRouterCacheMode: 'default' },
      },
    })

    if (isNextDev) {
      // since the router behavior is different in development mode (no viewport prefetching + liberal revalidation)
      // we only check the production behavior
      it('should skip dev', () => {})
    } else {
      runTests(next)
    }
  })
})
