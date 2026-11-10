import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
import { assertNoConsoleErrors, waitForNoRedbox } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

const getExpectedErrorMessage = (route: string) =>
  `Route "${route}": \`searchParams\` can't be read inside \`"use cache"\`. Await it outside the cached function and pass what you need as an argument.\nLearn more: https://nextjs.org/docs/messages/next-request-in-use-cache`

// We use separate per-page prerenders for CLI output, which we cannot do in deploy.
// @force-gate !deploy
describe('use-cache-search-params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: isNextStart,
  })

  beforeAll(async () => {
    if (isNextStart) {
      const args = ['--experimental-build-mode', 'compile']
      const result = await next.build({ args })
      if (result.exitCode !== 0) {
        throw new Error('Failed to build. CLI Output:\n\n' + result.cliOutput)
      }
    }
  })

  const prerenderPattern = async (pattern: string) => {
    const args = [
      '--experimental-build-mode',
      'generate',
      '--debug-build-paths',
      pattern,
    ]
    const result = await next.build({ args })
    if (
      result.cliOutput.includes(`Pattern "${pattern}" did not match any files`)
    ) {
      throw new Error(`Pattern "${pattern}" did not match any files`)
    }
    return result
  }

  const prerenderPage = (route: string) => {
    return prerenderPattern(`app${route}/page.tsx`)
  }

  describe('when searchParams are used inside of "use cache"', () => {
    it('should show an error', async () => {
      const route = '/search-params-used'
      if (isNextDev) {
        const browser = await next.browser(`${route}?foo=1`)
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Route "/search-params-used": \`searchParams\` can't be read inside \`"use cache"\`. Await it outside the cached function and pass what you need as an argument.
         Learn more: https://nextjs.org/docs/messages/next-request-in-use-cache",
           "environmentLabel": "Cache",
           "label": "Runtime Error",
           "source": "app/search-params-used/page.tsx (8:17) @ Page
         >  8 |   const param = (await searchParams).foo
              |                 ^",
           "stack": [
             "Page app/search-params-used/page.tsx (8:17)",
           ],
         }
        `)
      } else {
        const result = await prerenderPage(route)
        expect(result.cliOutput).toContain(getExpectedErrorMessage(route))
        expect(result.exitCode).toBe(1)
      }
    })
  })

  describe('when searchParams are caught inside of "use cache"', () => {
    const route = '/search-params-caught'
    it('should show an error', async () => {
      if (isNextDev) {
        const browser = await next.browser(`${route}?foo=1`)
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": "Route "/search-params-caught": \`searchParams\` can't be read inside \`"use cache"\`. Await it outside the cached function and pass what you need as an argument.
         Learn more: https://nextjs.org/docs/messages/next-request-in-use-cache",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": "app/search-params-caught/page.tsx (11:5) @ Page
         > 11 |     param = (await searchParams).foo
              |     ^",
           "stack": [
             "Page app/search-params-caught/page.tsx (11:5)",
           ],
         }
        `)
      } else {
        const result = await prerenderPage(route)
        expect(result.cliOutput).toContain(getExpectedErrorMessage(route))
        expect(result.exitCode).toBe(1)
      }
    })

    // @force-gate dev
    it('should also show an error after the second reload', async () => {
      // There was an obscure bug that lead to the error not being triggered
      // anymore starting with the third request. We test this scenario
      // explicitly to ensure we won't regress.
      const browser = await next.browser(`${route}?foo=1`)
      await browser.refresh()
      await browser.refresh()

      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/search-params-caught": \`searchParams\` can't be read inside \`"use cache"\`. Await it outside the cached function and pass what you need as an argument.
       Learn more: https://nextjs.org/docs/messages/next-request-in-use-cache",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/search-params-caught/page.tsx (11:5) @ Page
       > 11 |     param = (await searchParams).foo
            |     ^",
         "stack": [
           "Page app/search-params-caught/page.tsx (11:5)",
         ],
       }
      `)
    })
  })

  describe('when searchParams are unused inside of "use cache"', () => {
    const route = '/search-params-unused'
    it('should not show an error', async () => {
      if (isNextDev) {
        const getCliOutput = next.getCliOutputFromHere()
        const browser = await next.browser(`${route}?foo=1`)

        await waitForNoRedbox(browser)

        const cliOutput = stripAnsi(getCliOutput())
        expect(cliOutput).not.toContain(getExpectedErrorMessage(route))
      } else {
        const result = await prerenderPage(route)
        expect(result.cliOutput).not.toContain(getExpectedErrorMessage(route))
        expect(result.exitCode).toBe(0)
      }
    })
  })

  it('should show an error when searchParams are used inside of a cached generateMetadata', async () => {
    const route = '/search-params-used-generate-metadata'
    if (isNextDev) {
      const browser = await next.browser(`${route}?title=foo`)
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Route "/search-params-used-generate-metadata": \`searchParams\` can't be read inside \`"use cache"\`. Await it outside the cached function and pass what you need as an argument.
       Learn more: https://nextjs.org/docs/messages/next-request-in-use-cache",
         "environmentLabel": "Cache",
         "label": "Runtime Error",
         "source": "app/search-params-used-generate-metadata/page.tsx (9:17) @ generateMetadata
       >  9 |   const title = (await searchParams).title
            |                 ^",
         "stack": [
           "generateMetadata app/search-params-used-generate-metadata/page.tsx (9:17)",
         ],
       }
      `)
    } else {
      const result = await prerenderPage(route)
      expect(result.cliOutput).toContain(getExpectedErrorMessage(route))
      expect(result.exitCode).toBe(1)
    }
  })

  it('should show an error when searchParams are used inside of a cached generateViewport', async () => {
    const route = '/search-params-used-generate-viewport'
    if (isNextDev) {
      const browser = await next.browser(`${route}?color=red`)
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Route "/search-params-used-generate-viewport": \`searchParams\` can't be read inside \`"use cache"\`. Await it outside the cached function and pass what you need as an argument.
       Learn more: https://nextjs.org/docs/messages/next-request-in-use-cache",
         "environmentLabel": "Cache",
         "label": "Runtime Error",
         "source": "app/search-params-used-generate-viewport/page.tsx (9:17) @ generateViewport
       >  9 |   const color = (await searchParams).color
            |                 ^",
         "stack": [
           "generateViewport app/search-params-used-generate-viewport/page.tsx (9:17)",
         ],
       }
      `)
    } else {
      const result = await prerenderPage(route)
      expect(result.cliOutput).toContain(getExpectedErrorMessage(route))
      expect(result.exitCode).toBe(1)
    }
  })

  // @force-gate start
  describe('runtime behavior', () => {
    afterEach(() => next.stop())
    it('should resume a cached page that does not access search params without hydration errors', async () => {
      const result = await next.build({
        args: ['--debug-build-paths', 'app/search-params-unused/page.tsx'],
      })
      if (result.exitCode !== 0) {
        throw new Error('Failed to build. CLI Output:\n\n' + result.cliOutput)
      }

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
  })
})
