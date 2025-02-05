import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  assertNoRedbox,
  getRedboxDescription,
  getRedboxSource,
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'

const getExpectedErrorMessage = (route: string) =>
  `Error: Route ${route} used "searchParams" inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use "searchParams" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`

describe('use-cache-standalone-search-params', () => {
  const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: process.env.NEXT_TEST_MODE !== 'dev',
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    let route: string

    describe('when searchParams are used inside of "use cache"', () => {
      beforeAll(() => {
        route = '/search-params-used'
      })

      it('should show an error', async () => {
        const outputIndex = next.cliOutput.length
        const browser = await next.browser(`${route}?foo=1`)

        await assertHasRedbox(browser)

        const errorDescription = await getRedboxDescription(browser)
        const errorSource = await getRedboxSource(browser)
        const expectedErrorMessage = getExpectedErrorMessage(route)

        expect(errorDescription).toBe(`[ Cache ] ${expectedErrorMessage}`)

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        if (isTurbopack) {
          // TODO(veil): Should have a mapped error source.
          expect(errorSource).toBe(null)

          // TODO(veil): Should be a relative filename.
          expect(cliOutput).toContain(`${expectedErrorMessage}
    at Page (file:/`)
        } else {
          expect(errorSource).toMatchInlineSnapshot(`
           "app/search-params-used/page.tsx (8:18) @ Page

              6 |   searchParams: Promise<{ [key: string]: string | string[] | undefined }>
              7 | }) {
           >  8 |   const param = (await searchParams).foo
                |                  ^
              9 |
             10 |   return <p>param: {param}</p>
             11 | }"
          `)

          expect(cliOutput).toContain(`${expectedErrorMessage}
    at Page (app/search-params-used/page.tsx:8:17)`)
        }
      })
    })

    describe('when searchParams are unused inside of "use cache"', () => {
      beforeAll(() => {
        route = '/search-params-unused'
      })

      it('should not show an error', async () => {
        const outputIndex = next.cliOutput.length
        const browser = await next.browser(`${route}?foo=1`)

        await assertNoRedbox(browser)

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        expect(cliOutput).not.toContain(getExpectedErrorMessage(route))
      })
    })
  } else {
    it('should fail the build with errors', async () => {
      const { cliOutput } = await next.build()

      expect(cliOutput).toInclude(
        getExpectedErrorMessage('/search-params-used')
      )

      expect(cliOutput).not.toInclude(
        getExpectedErrorMessage('/search-params-unused')
      )

      expect(cliOutput).toInclude(
        'Error occurred prerendering page "/search-params-used"'
      )

      expect(cliOutput).not.toInclude(
        'Error occurred prerendering page "/search-params-unused"'
      )
    })
  }
})
