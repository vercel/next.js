import { nextTestSetup } from 'e2e-utils'
import { browserConfigWithFixedTime, fastForwardTo } from './test-utils'
import { findAllTelemetryEvents } from 'next-test-utils'
import path from 'path'

describe('app dir client cache semantics (experimental staleTimes)', () => {
  describe('dynamic: 0', () => {
    const { next, isNextDev, isNextDeploy } = nextTestSetup({
      files: path.join(__dirname, 'fixtures', 'regular'),
      nextConfig: {
        experimental: { staleTimes: { dynamic: 0 } },
      },
      env: {
        NEXT_TELEMETRY_DEBUG: '1',
      },
    })

    if (isNextDev) {
      // dev doesn't support prefetch={true}, so this just performs a basic test to make sure data is fresh on each navigation
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

      return
    }

    describe('prefetch={true}', () => {
      it('should re-use the cache for 5 minutes (default "static" time)', async () => {
        const browser = await next.browser('/', browserConfigWithFixedTime)

        // Wait for the prefetch to complete before clicking
        await browser.waitForIdleNetwork()

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

    if (!isNextDeploy) {
      describe('telemetry', () => {
        it('should send staleTimes feature usage event', async () => {
          const events = findAllTelemetryEvents(
            next.cliOutput,
            'NEXT_CLI_SESSION_STARTED'
          )

          expect(events).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                staticStaleTime: null,
                dynamicStaleTime: 0,
              }),
            ])
          )
        })
      })
    }
  })

  describe('static: 180', () => {
    const { next, isNextDev, isNextDeploy } = nextTestSetup({
      files: path.join(__dirname, 'fixtures', 'regular'),
      nextConfig: {
        experimental: { staleTimes: { static: 180 } },
      },
      env: {
        NEXT_TELEMETRY_DEBUG: '1',
      },
    })

    if (isNextDev) {
      // since the router behavior is different in development mode (no viewport prefetching + liberal revalidation)
      // we only check the production behavior
      it('should skip dev', () => {})
      return
    }

    describe('prefetch={true}', () => {
      it('should use the custom static override time (3 minutes)', async () => {
        const browser = await next.browser('/', browserConfigWithFixedTime)

        // Wait for the prefetch to complete before clicking
        await browser.waitForIdleNetwork()

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

        await browser.eval(fastForwardTo, 3 * 60 * 1000) // fast forward 3 minutes

        await browser.elementByCss('[href="/"]').click()

        newRandomNumber = await browser
          .elementByCss('[href="/0?timeout=0"]')
          .click()
          .waitForElementByCss('#random-number')
          .text()

        expect(initialRandomNumber).not.toBe(newRandomNumber)
      })
    })

    describe('prefetch={undefined} - default', () => {
      it('should re-use the loading boundary for the custom static override time (3 minutes)', async () => {
        const browser = await next.browser('/', browserConfigWithFixedTime)

        const loadingRandomNumber = await browser
          .elementByCss('[href="/1?timeout=1000"]')
          .click()
          .waitForElementByCss('#loading')
          .text()

        await browser.elementByCss('[href="/"]').click()

        await browser.eval(fastForwardTo, 2 * 60 * 1000) // fast forward 2 minutes

        let newLoadingNumber = await browser
          .elementByCss('[href="/1?timeout=1000"]')
          .click()
          .waitForElementByCss('#loading')
          .text()

        expect(loadingRandomNumber).toBe(newLoadingNumber)

        await browser.elementByCss('[href="/"]').click()

        await browser.eval(fastForwardTo, 2 * 60 * 1000) // fast forward 2 minutes

        newLoadingNumber = await browser
          .elementByCss('[href="/1?timeout=1000"]')
          .click()
          .waitForElementByCss('#loading')
          .text()

        expect(loadingRandomNumber).not.toBe(newLoadingNumber)
      })
    })

    if (!isNextDeploy) {
      describe('telemetry', () => {
        it('should send staleTimes feature usage event', async () => {
          const events = findAllTelemetryEvents(
            next.cliOutput,
            'NEXT_CLI_SESSION_STARTED'
          )
          expect(events).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                staticStaleTime: 180,
                dynamicStaleTime: null,
              }),
            ])
          )
        })
      })
    }
  })

  describe('dynamic: 0, static: 0', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures', 'regular'),
      nextConfig: {
        experimental: { staleTimes: { dynamic: 0, static: 0 } },
      },
      env: {
        NEXT_TELEMETRY_DEBUG: '1',
      },
    })

    // dev doesn't support prefetch={true}, so this just performs a basic test to make sure data is fresh on each navigation
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
