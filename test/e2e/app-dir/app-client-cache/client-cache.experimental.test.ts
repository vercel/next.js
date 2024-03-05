import { nextTestSetup } from 'e2e-utils'
import { browserConfigWithFixedTime, fastForwardTo } from './test-utils'

describe('app dir client cache semantics (experimental clientRouterCache)', () => {
  describe('clientRouterCache = true', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        experimental: { clientRouterCache: true },
      },
    })

    describe('prefetch={true}', () => {
      test('we should get a cached version of the page every request', async () => {
        const browser = await next.browser('/', browserConfigWithFixedTime)

        const initialRandomNumber = await browser
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

        await browser.eval(fastForwardTo, 2 * 60 * 60 * 1000) // fast forward 2 hours

        await browser.elementByCss('[href="/"]').click()

        newRandomNumber = await browser
          .elementByCss('[href="/0?timeout=0"]')
          .click()
          .waitForElementByCss('#random-number')
          .text()

        expect(initialRandomNumber).toBe(newRandomNumber)
      })
    })

    describe('prefetch={false}', () => {
      test('we should get a loading state before fetching the page, followed by a cached version of the page every request', async () => {
        const browser = await next.browser('/', browserConfigWithFixedTime)
        // verify we rendered the loading state
        await browser
          .elementByCss('[href="/2?timeout=1000"]')
          .click()
          .waitForElementByCss('#loading')

        const initialRandomNumber = await browser
          .waitForElementByCss('#random-number')
          .text()

        await browser.elementByCss('[href="/"]').click()

        await browser.eval(fastForwardTo, 2 * 60 * 60 * 1000) // fast forward 2 hours

        const newRandomNumber = await browser
          .elementByCss('[href="/2?timeout=1000"]')
          .click()
          .waitForElementByCss('#random-number')
          .text()

        expect(initialRandomNumber).toBe(newRandomNumber)
      })

      describe('without a loading boundary', () => {
        test('we should get a cached version of the page every request', async () => {
          const browser = await next.browser(
            '/without-loading',
            browserConfigWithFixedTime
          )

          const initialRandomNumber = await browser
            .elementByCss('[href="/without-loading/2?timeout=1000"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          await browser.elementByCss('[href="/without-loading"]').click()

          await browser.eval(fastForwardTo, 2 * 60 * 60 * 1000) // fast forward 2 hours

          const newRandomNumber = await browser
            .elementByCss('[href="/without-loading/2?timeout=1000"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          expect(initialRandomNumber).toBe(newRandomNumber)
        })
      })
    })

    describe('prefetch={undefined} - default', () => {
      test('we should get a loading state before fetching the page, followed by a cached version of the page every request', async () => {
        const browser = await next.browser('/', browserConfigWithFixedTime)

        // verify we rendered the loading state
        await browser
          .elementByCss('[href="/1?timeout=1000"]')
          .click()
          .waitForElementByCss('#loading')

        const initialRandomNumber = await browser
          .waitForElementByCss('#random-number')
          .text()

        await browser.elementByCss('[href="/"]').click()

        await browser.eval(fastForwardTo, 2 * 60 * 60 * 1000) // fast forward 2 hours

        const newRandomNumber = await browser
          .elementByCss('[href="/1?timeout=1000"]')
          .click()
          .waitForElementByCss('#random-number')
          .text()

        expect(initialRandomNumber).toBe(newRandomNumber)
      })

      describe('without a loading boundary', () => {
        test('we should get a cached version of the page every request', async () => {
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

          await browser.eval(fastForwardTo, 2 * 60 * 60 * 1000) // fast forward 2 hours

          const newRandomNumber = await browser
            .elementByCss('[href="/without-loading/1?timeout=1000"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          expect(initialRandomNumber).toBe(newRandomNumber)
        })
      })
    })
  })

  describe('clientRouterCache = false', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        experimental: { clientRouterCache: false },
      },
    })

    describe('prefetch={true}', () => {
      test('we should get fresh data on every subsequent navigation', async () => {
        const browser = await next.browser('/', browserConfigWithFixedTime)

        const initialRandomNumber = await browser
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

        expect(initialRandomNumber).not.toBe(newRandomNumber)

        await browser.eval(fastForwardTo, 5 * 1000) // fast forward 5 seconds

        await browser.elementByCss('[href="/"]').click()

        newRandomNumber = await browser
          .elementByCss('[href="/0?timeout=0"]')
          .click()
          .waitForElementByCss('#random-number')
          .text()

        expect(initialRandomNumber).not.toBe(newRandomNumber)
      })

      test('we should get a loading state before fetching the page, followed by fresh data on every subsequent navigation', async () => {
        const browser = await next.browser('/', browserConfigWithFixedTime)

        // this test introduces an artificial delay in rendering the requested page, so we verify a loading state is rendered
        await browser
          .elementByCss('[href="/0?timeout=1000"]')
          .click()
          .waitForElementByCss('#loading')

        const initialRandomNumber = await browser
          .waitForElementByCss('#random-number')
          .text()

        await browser.elementByCss('[href="/"]').click()

        await browser.eval(fastForwardTo, 5 * 1000) // fast forward 5 seconds

        const newRandomNumber = await browser
          .elementByCss('[href="/0?timeout=1000"]')
          .click()
          .waitForElementByCss('#random-number')
          .text()

        expect(initialRandomNumber).not.toBe(newRandomNumber)
      })

      describe('without a loading boundary', () => {
        test('we should get fresh data on every subsequent navigation', async () => {
          const browser = await next.browser(
            '/without-loading',
            browserConfigWithFixedTime
          )

          const initialRandomNumber = await browser
            .elementByCss('[href="/without-loading/0?timeout=1000"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          await browser.elementByCss('[href="/without-loading"]').click()

          let newRandomNumber = await browser
            .elementByCss('[href="/without-loading/0?timeout=1000"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          expect(initialRandomNumber).not.toBe(newRandomNumber)

          await browser.eval(fastForwardTo, 5 * 1000) // fast forward 5 seconds

          await browser.elementByCss('[href="/without-loading"]').click()

          newRandomNumber = await browser
            .elementByCss('[href="/without-loading/0?timeout=1000"]')
            .click()
            .waitForElementByCss('#random-number')
            .text()

          expect(initialRandomNumber).not.toBe(newRandomNumber)
        })
      })
    })

    describe('prefetch={false}', () => {
      test('we should get a loading state before fetching the page, followed by fresh data on every subsequent navigation', async () => {
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
        test('we should get fresh data on every subsequent navigation', async () => {
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
      test('we should get a loading state before fetching the page, followed by fresh data on every subsequent navigation', async () => {
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
        test('we should get fresh data on every subsequent navigation', async () => {
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
})
