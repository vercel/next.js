import { nextTestSetup } from 'e2e-utils'
import {
  getRedboxDescription,
  getRedboxSource,
  openRedbox,
  assertHasRedbox,
  getRedboxTitle,
  getRedboxTotalErrorCount,
  assertNoRedbox,
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'

const expectedErrorMessage =
  'Error: Filling a cache during prerender timed out, likely because request-specific arguments such as params, searchParams, cookies() or dynamic data were used inside "use cache".'

describe('use-cache-hanging-inputs', () => {
  const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: process.env.NEXT_TEST_MODE !== 'dev',
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    describe('when searchParams are used inside of "use cache"', () => {
      it('should show an error toast after a timeout', async () => {
        const outputIndex = next.cliOutput.length
        const browser = await next.browser('/search-params?n=1')

        // The request is pending while we stall on the hanging inputs, and
        // playwright will wait for the load event before continuing. So we
        // don't need to wait for the "use cache" timeout of 50 seconds here.

        await openRedbox(browser)

        const errorDescription = await getRedboxDescription(browser)
        const errorSource = await getRedboxSource(browser)

        expect(errorDescription).toBe(`[ Cache ] ${expectedErrorMessage}`)

        // TODO(veil): This should have an error source if the source mapping works.
        expect(errorSource).toBe(null)

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        // TODO(veil): Should include properly source mapped stack frames.
        expect(cliOutput).toContain(
          isTurbopack
            ? `${expectedErrorMessage}
    at [project]/app/search-params/page.tsx [app-rsc] (ecmascript)`
            : `${expectedErrorMessage}
    at eval (webpack-internal:///(rsc)/./app/search-params/page.tsx:16:97)`
        )
      }, 180_000)
    })

    describe('when searchParams are unused inside of "use cache"', () => {
      it('should not show an error', async () => {
        const outputIndex = next.cliOutput.length
        const browser = await next.browser('/search-params-unused?n=1')

        await assertNoRedbox(browser)

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        expect(cliOutput).not.toContain(expectedErrorMessage)
      })
    })

    describe('when an uncached promise is used inside of "use cache"', () => {
      it('should show an error toast after a timeout', async () => {
        const outputIndex = next.cliOutput.length
        const browser = await next.browser('/uncached-promise')

        // The request is pending while we stall on the hanging inputs, and
        // playwright will wait for the load even before continuing. So we don't
        // need to wait for the "use cache" timeout of 50 seconds here.

        await openRedbox(browser)

        const errorDescription = await getRedboxDescription(browser)
        const errorSource = await getRedboxSource(browser)

        expect(errorDescription).toBe(`[ Cache ] ${expectedErrorMessage}`)

        // TODO(veil): This should have an error source if the source mapping works.
        expect(errorSource).toBe(null)

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        // TODO(veil): Should include properly source mapped stack frames.
        expect(cliOutput).toContain(
          isTurbopack
            ? `${expectedErrorMessage}
    at [project]/app/uncached-promise/page.tsx [app-rsc] (ecmascript)`
            : `${expectedErrorMessage}
    at eval (webpack-internal:///(rsc)/./app/uncached-promise/page.tsx:26:97)`
        )
      }, 180_000)
    })

    describe('when an uncached promise is used inside of a nested "use cache"', () => {
      it('should show an error toast after a timeout', async () => {
        const outputIndex = next.cliOutput.length
        const browser = await next.browser('/uncached-promise-nested')

        // The request is pending while we stall on the hanging inputs, and
        // playwright will wait for the load even before continuing. So we don't
        // need to wait for the "use cache" timeout of 50 seconds here.

        await openRedbox(browser)

        const errorDescription = await getRedboxDescription(browser)
        const errorSource = await getRedboxSource(browser)

        expect(errorDescription).toBe(`[ Cache ] ${expectedErrorMessage}`)

        // TODO(veil): This should have an error source if the source mapping works.
        expect(errorSource).toBe(null)

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        // TODO(veil): Should include properly source mapped stack frames.
        expect(cliOutput).toContain(
          isTurbopack
            ? `${expectedErrorMessage}
    at [project]/app/uncached-promise-nested/page.tsx [app-rsc] (ecmascript)`
            : `${expectedErrorMessage}
    at eval (webpack-internal:///(rsc)/./app/uncached-promise-nested/page.tsx:35:97)`
        )
      }, 180_000)
    })

    describe('when an error is thrown', () => {
      it('should show an error overlay with only one error', async () => {
        const browser = await next.browser('/error')

        await assertHasRedbox(browser)

        const count = await getRedboxTotalErrorCount(browser)
        const title = await getRedboxTitle(browser)
        const description = await getRedboxDescription(browser)

        expect({ count, title, description }).toEqual({
          count: 1,
          title: 'Unhandled Runtime Error',
          description: '[ Cache ] Error: kaputt!',
        })
      })
    })
  } else {
    it('should fail the build with errors after a timeout', async () => {
      const { cliOutput } = await next.build()

      expect(cliOutput).toInclude(expectedErrorMessage)

      expect(cliOutput).toInclude(
        'Error occurred prerendering page "/search-params"'
      )

      expect(cliOutput).toInclude(
        'Error occurred prerendering page "/uncached-promise"'
      )

      expect(cliOutput).toInclude(
        'Error occurred prerendering page "/uncached-promise-nested"'
      )
    }, 180_000)
  }
})
