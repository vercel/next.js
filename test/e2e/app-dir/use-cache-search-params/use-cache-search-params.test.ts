import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  assertNoConsoleErrors,
  assertNoRedbox,
  getRedboxDescription,
  getRedboxSource,
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'

const getExpectedErrorMessage = (route: string) =>
  `Route ${route} used \`searchParams\` inside "use cache". Accessing dynamic request data inside a cache scope is not supported. If you need some search params inside a cached function await \`searchParams\` outside of the cached function and pass only the required search params as arguments to the cached function. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`

describe('use-cache-search-params', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
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

        expect(errorDescription).toBe(expectedErrorMessage)

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        expect(errorSource).toMatchInlineSnapshot(`
         "app/search-params-used/page.tsx (8:17) @ Page

            6 |   searchParams: Promise<{ [key: string]: string | string[] | undefined }>
            7 | }) {
         >  8 |   const param = (await searchParams).foo
              |                 ^
            9 |
           10 |   return <p>param: {param}</p>
           11 | }"
        `)

        expect(cliOutput).toContain(`Error: ${expectedErrorMessage}
    at Page (app/search-params-used/page.tsx:8:17)`)
      })
    })

    describe('when searchParams are caught inside of "use cache"', () => {
      beforeAll(() => {
        route = '/search-params-caught'
      })

      it('should show an error', async () => {
        const outputIndex = next.cliOutput.length
        const browser = await next.browser(`${route}?foo=1`)

        await assertHasRedbox(browser)

        const errorDescription = await getRedboxDescription(browser)
        const errorSource = await getRedboxSource(browser)
        const expectedErrorMessage = getExpectedErrorMessage(route)

        expect(errorDescription).toBe(expectedErrorMessage)

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        expect(errorSource).toMatchInlineSnapshot(`
         "app/search-params-caught/page.tsx (11:5) @ Page

            9 |
           10 |   try {
         > 11 |     param = (await searchParams).foo
              |     ^
           12 |   } catch {}
           13 |
           14 |   return <p>param: {param}</p>"
        `)

        expect(cliOutput).toContain(`Error: ${expectedErrorMessage}
    at Page (app/search-params-caught/page.tsx:11:5)`)
      })

      it('should also show an error after the second reload', async () => {
        // There was an obscure bug that lead to the error not being triggered
        // anymore starting with the third request. We test this scenario
        // explicitly to ensure we won't regress.
        const browser = await next.browser(`${route}?foo=1`)
        await browser.refresh()
        await browser.refresh()

        await assertHasRedbox(browser)

        const errorDescription = await getRedboxDescription(browser)

        expect(errorDescription).toBe(getExpectedErrorMessage(route))
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

    it('should show an error when searchParams are used inside of a cached generateMetadata', async () => {
      const browser = await next.browser(
        '/search-params-used-generate-metadata?title=foo'
      )

      await expect(browser).toDisplayRedbox(`
       {
         "description": "Route /search-params-used-generate-metadata used \`searchParams\` inside "use cache". Accessing dynamic request data inside a cache scope is not supported. If you need some search params inside a cached function await \`searchParams\` outside of the cached function and pass only the required search params as arguments to the cached function. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/search-params-used-generate-metadata/page.tsx (9:17) @ generateMetadata
       >  9 |   const title = (await searchParams).title
            |                 ^",
         "stack": [
           "generateMetadata app/search-params-used-generate-metadata/page.tsx (9:17)",
         ],
       }
      `)
    })

    it('should show an error when searchParams are used inside of a cached generateViewport', async () => {
      const browser = await next.browser(
        '/search-params-used-generate-viewport?color=red'
      )

      await expect(browser).toDisplayRedbox(`
       {
         "description": "Route /search-params-used-generate-viewport used \`searchParams\` inside "use cache". Accessing dynamic request data inside a cache scope is not supported. If you need some search params inside a cached function await \`searchParams\` outside of the cached function and pass only the required search params as arguments to the cached function. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/search-params-used-generate-viewport/page.tsx (9:17) @ generateViewport
       >  9 |   const color = (await searchParams).color
            |                 ^",
         "stack": [
           "generateViewport app/search-params-used-generate-viewport/page.tsx (9:17)",
         ],
       }
      `)
    })
  } else {
    afterEach(async () => {
      await next.stop()
    })

    it('should fail the build with errors', async () => {
      const { cliOutput } = await next.build()

      expect(cliOutput).toInclude(
        getExpectedErrorMessage('/search-params-used')
      )

      expect(cliOutput).toInclude(
        getExpectedErrorMessage('/search-params-caught')
      )

      expect(cliOutput).not.toInclude(
        getExpectedErrorMessage('/search-params-unused')
      )

      expect(cliOutput).toInclude(
        'Error occurred prerendering page "/search-params-used"'
      )

      expect(cliOutput).toInclude(
        'Error occurred prerendering page "/search-params-caught"'
      )

      expect(cliOutput).not.toInclude(
        'Error occurred prerendering page "/search-params-unused"'
      )
    })

    it('should resume a cached page that does not access search params without hydration errors', async () => {
      await next.build({
        env: {
          NEXT_PRIVATE_APP_PATHS: JSON.stringify([
            '/search-params-unused/page.tsx',
          ]),
        },
      })

      await next.start({ skipBuild: true })

      let browser = await next.browser('/search-params-unused', {
        disableJavaScript: true,
      })

      const prerenderedPageDate = await browser.elementById('page-date').text()

      await browser.close()

      browser = await next.browser('/search-params-unused', {
        pushErrorAsConsoleLog: true,
      })

      // After hydration, the resumed page date should be the prerendered date.
      // Note: When cacheComponents is not enabled, the page is not actually
      // prerendered, but because the page is cached on the first page load, the
      // date should still be the same for the second page load.
      expect(await browser.elementById('page-date').text()).toBe(
        prerenderedPageDate
      )

      // There should also be no hydration errors due to a buildtime date being
      // replaced by a new runtime date.
      await assertNoConsoleErrors(browser)
    })
  }
})
