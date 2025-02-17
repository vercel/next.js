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

const isExperimentalReact = process.env.__NEXT_EXPERIMENTAL_PPR

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

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        if (isTurbopack) {
          // TODO(veil): For Turbopack, a fix in the React Flight Client, where
          // sourceURL is encoded, is needed for the error source and stack
          // frames to be source mapped.

          expect(errorSource).toBe(null)

          expect(cliOutput).toContain(`${expectedErrorMessage}
    at [project]/app/search-params/page.tsx [app-rsc] (ecmascript)`)
        } else {
          expect(errorSource).toMatchInlineSnapshot(`
           "app/search-params/page.tsx (3:16) @ eval

             1 | 'use cache'
             2 |
           > 3 | export default async function Page({
               |                ^
             4 |   searchParams,
             5 | }: {
             6 |   searchParams: Promise<{ n: string }>"
          `)

          expect(cliOutput).toContain(`${expectedErrorMessage}
    at eval (app/search-params/page.tsx:3:15)`)
        }
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

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        if (isTurbopack) {
          // TODO(veil): For Turbopack, a fix in the React Flight Client, where
          // sourceURL is encoded, is needed for the error source and stack
          // frames to be source mapped.

          expect(errorSource).toBe(null)

          expect(cliOutput).toContain(`${expectedErrorMessage}
    at [project]/app/uncached-promise/page.tsx [app-rsc] (ecmascript)`)
        } else {
          expect(errorSource).toMatchInlineSnapshot(`
           "app/uncached-promise/page.tsx (10:13) @ eval

              8 | }
              9 |
           > 10 | const Foo = async ({ promise }) => {
                |             ^
             11 |   'use cache'
             12 |
             13 |   return ("
          `)

          expect(cliOutput).toContain(`${expectedErrorMessage}
    at eval (app/uncached-promise/page.tsx:10:12)`)
        }
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

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        if (isTurbopack) {
          // TODO(veil): For Turbopack, a fix in the React Flight Client, where
          // sourceURL is encoded, is needed for the error source and stack
          // frames to be source mapped.

          expect(errorSource).toBe(null)

          expect(cliOutput).toContain(`${expectedErrorMessage}
    at [project]/app/uncached-promise-nested/page.tsx [app-rsc] (ecmascript)`)
        } else {
          expect(errorSource).toMatchInlineSnapshot(`
           "app/uncached-promise-nested/page.tsx (16:1) @ eval

             14 | }
             15 |
           > 16 | async function indirection(promise: Promise<number>) {
                | ^
             17 |   'use cache'
             18 |
             19 |   return getCachedData(promise)"
          `)

          expect(cliOutput).toContain(`${expectedErrorMessage}
    at eval (app/uncached-promise-nested/page.tsx:16:0)`)
        }
      }, 180_000)
    })

    describe('when a "use cache" function is closing over an uncached promise', () => {
      it('should show an error toast after a timeout', async () => {
        const outputIndex = next.cliOutput.length
        const browser = await next.browser('/bound-args')

        // The request is pending while we stall on the hanging inputs, and
        // playwright will wait for the load even before continuing. So we don't
        // need to wait for the "use cache" timeout of 50 seconds here.

        await openRedbox(browser)

        const errorDescription = await getRedboxDescription(browser)
        const errorSource = await getRedboxSource(browser)

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        if (isExperimentalReact) {
          // TODO(react-time-info): Remove this branch for experimental React when the issue is
          // resolved where the inclusion of server timings in the RSC payload
          // makes the serialized bound args not suitable to be used as a cache
          // key.

          const expectedErrorMessagePpr =
            'Error: Route "/bound-args": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don\'t have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense'

          expect(errorDescription).toBe(`[ Server ] ${expectedErrorMessagePpr}`)

          expect(cliOutput).toContain(
            `${expectedErrorMessagePpr}
    at Page [Server] (<anonymous>)`
          )
        } else {
          expect(errorDescription).toBe(`[ Cache ] ${expectedErrorMessage}`)

          if (isTurbopack) {
            // TODO(veil): For Turbopack, a fix in the React Flight Client, where
            // sourceURL is encoded, is needed for the error source and stack
            // frames to be source mapped.

            expect(errorSource).toBe(null)

            expect(cliOutput).toContain(`${expectedErrorMessage}
    at [project]/app/bound-args/page.tsx [app-rsc] (ecmascript)`)
          } else {
            expect(errorSource).toMatchInlineSnapshot(`
             "app/bound-args/page.tsx (13:15) @ eval

               11 |   const uncachedDataPromise = fetchUncachedData()
               12 |
             > 13 |   const Foo = async () => {
                  |               ^
               14 |     'use cache'
               15 |
               16 |     return ("
            `)

            expect(cliOutput).toContain(`${expectedErrorMessage}
    at eval (app/bound-args/page.tsx:13:14)`)
          }
        }
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
        'Error occurred prerendering page "/bound-args"'
      )

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
