import { nextTestSetup } from 'e2e-utils'
import escapeStringRegexp from 'escape-string-regexp'
import {
  getRedboxDescription,
  getRedboxSource,
  openRedbox,
  assertHasRedbox,
  getRedboxTitle,
  getRedboxTotalErrorCount,
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'

const expectedTimeoutErrorMessage =
  'Filling a cache during prerender timed out, likely because request-specific arguments such as params, searchParams, cookies() or dynamic data were used inside "use cache".'

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
    describe('when an uncached promise is used inside of "use cache"', () => {
      it('should show an error toast after a timeout', async () => {
        const outputIndex = next.cliOutput.length
        const browser = await next.browser('/uncached-promise')

        // The request is pending while we stall on the hanging inputs, and
        // playwright will wait for the load even before continuing. So we don't
        // need to wait for the "use cache" timeout of 50 seconds here.

        await openRedbox(browser)

        const errorCount = await getRedboxTotalErrorCount(browser)
        const errorDescription = await getRedboxDescription(browser)
        const errorSource = await getRedboxSource(browser)

        expect(errorCount).toBe(1)
        expect(errorDescription).toBe(expectedTimeoutErrorMessage)

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        if (isTurbopack) {
          expect(errorSource).toMatchInlineSnapshot(`
           "app/uncached-promise/page.tsx (10:13) @ module evaluation

              8 | }
              9 |
           > 10 | const Foo = async ({ promise }) => {
                |             ^
             11 |   'use cache'
             12 |
             13 |   return ("
          `)

          expect(cliOutput).toContain(`Error: ${expectedTimeoutErrorMessage}
    at module evaluation`)
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

          expect(cliOutput).toContain(`Error: ${expectedTimeoutErrorMessage}
    at eval (app/uncached-promise/page.tsx:10:13)`)
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

        const errorCount = await getRedboxTotalErrorCount(browser)
        const errorDescription = await getRedboxDescription(browser)
        const errorSource = await getRedboxSource(browser)

        expect(errorCount).toBe(1)
        expect(errorDescription).toBe(expectedTimeoutErrorMessage)

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        if (isTurbopack) {
          expect(errorSource).toMatchInlineSnapshot(`
           "app/uncached-promise-nested/page.tsx (16:1) @ module evaluation

             14 | }
             15 |
           > 16 | async function indirection(promise: Promise<number>) {
                | ^
             17 |   'use cache'
             18 |
             19 |   return getCachedData(promise)"
          `)

          expect(cliOutput).toContain(`Error: ${expectedTimeoutErrorMessage}
    at module evaluation`)
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

          expect(cliOutput).toContain(`Error: ${expectedTimeoutErrorMessage}
    at eval (app/uncached-promise-nested/page.tsx:16:1)`)
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

        const errorCount = await getRedboxTotalErrorCount(browser)
        const errorDescription = await getRedboxDescription(browser)
        const errorSource = await getRedboxSource(browser)

        expect(errorCount).toBe(1)

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        expect(errorDescription).toBe(expectedTimeoutErrorMessage)

        if (isTurbopack) {
          expect(errorSource).toMatchInlineSnapshot(`
           "app/bound-args/page.tsx (13:15) @ module evaluation

             11 |   const uncachedDataPromise = fetchUncachedData()
             12 |
           > 13 |   const Foo = async () => {
                |               ^
             14 |     'use cache'
             15 |
             16 |     return ("
          `)

          expect(cliOutput).toContain(`Error: ${expectedTimeoutErrorMessage}
    at module evaluation`)
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

          expect(cliOutput).toContain(`Error: ${expectedTimeoutErrorMessage}
    at eval (app/bound-args/page.tsx:13:15)`)
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
          // TODO(restart-on-cache-miss): fix environment labelling
          // title: 'Runtime Error\nCache',
          title: 'Runtime Error\nPrerender',
          description: 'kaputt!',
        })
      })
    })
  } else {
    // TODO: Be more precise about the expected error messages and stacks.
    it('should fail the build with errors after a timeout', async () => {
      const { cliOutput } = await next.build()

      expect(cliOutput).toInclude(createExpectedBuildErrorMessage('/error'))
      expect(cliOutput).toInclude('Error: kaputt!')

      expect(cliOutput).toIncludeRepeated(
        escapeStringRegexp(expectedTimeoutErrorMessage),
        4
      )

      expect(cliOutput).toInclude(
        createExpectedBuildErrorMessage('/bound-args')
      )

      expect(cliOutput).toInclude(
        createExpectedBuildErrorMessage('/transformed-params/[slug]')
      )

      expect(cliOutput).toInclude(
        createExpectedBuildErrorMessage('/uncached-promise')
      )

      expect(cliOutput).toInclude(
        createExpectedBuildErrorMessage('/uncached-promise-nested')
      )
    }, 180_000)
  }
})

function createExpectedBuildErrorMessage(pathname: string) {
  return `Error occurred prerendering page "${pathname}". Read more: https://nextjs.org/docs/messages/prerender-error`
}
