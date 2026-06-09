import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

const expectedTimeoutErrorMessage =
  'Filling a cache during prerender timed out, likely because request-specific arguments such as params, searchParams, cookies() or dynamic data were used inside "use cache".'

describe('use-cache-hanging', () => {
  const { next, isNextDev, skipped, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: process.env.NEXT_TEST_MODE !== 'dev',
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    describe('when a "use cache" fill hangs in the static stage', () => {
      it('should show an error after a timeout', async () => {
        const outputIndex = next.cliOutput.length
        const browser = await next.browser('/static')

        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E236",
           "description": "Filling a cache during prerender timed out, likely because request-specific arguments such as params, searchParams, cookies() or dynamic data were used inside "use cache".",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": "app/static/page.tsx (6:1) @ getCachedData
         > 6 | async function getCachedData(): Promise<string> {
             | ^",
           "stack": [
             "getCachedData app/static/page.tsx (6:1)",
             "Cached app/static/page.tsx (18:24)",
             "Page app/static/page.tsx (32:10)",
           ],
         }
        `)

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        expect(cliOutput).toContain(`Error: ${expectedTimeoutErrorMessage}
    at getCachedData (app/static/page.tsx:6:1)`)
      })
    })

    describe('when a "use cache" fill hangs in the runtime stage', () => {
      it('should show an error after a timeout', async () => {
        const outputIndex = next.cliOutput.length
        const browser = await next.browser('/runtime')

        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E236",
           "description": "Filling a cache during prerender timed out, likely because request-specific arguments such as params, searchParams, cookies() or dynamic data were used inside "use cache".",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": "app/runtime/page.tsx (8:1) @ getCachedData
         >  8 | async function getCachedData(): Promise<string> {
              | ^",
           "stack": [
             "getCachedData app/runtime/page.tsx (8:1)",
             "Cached app/runtime/page.tsx (20:24)",
             "Page app/runtime/page.tsx (42:7)",
           ],
         }
        `)

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        expect(cliOutput).toContain(`Error: ${expectedTimeoutErrorMessage}
    at getCachedData (app/runtime/page.tsx:8:1)`)
      })
    })

    describe('when navigating to the static page', () => {
      it('should show an error toast after a timeout', async () => {
        const outputIndex = next.cliOutput.length
        const browser = await next.browser('/')

        await browser.elementByCss('a[href="/static"]').click()

        await retry(() => {
          const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

          expect(cliOutput).toContain(`Error: ${expectedTimeoutErrorMessage}
    at getCachedData (app/static/page.tsx:6:1)`)
        }, 20_000)

        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E236",
           "description": "Filling a cache during prerender timed out, likely because request-specific arguments such as params, searchParams, cookies() or dynamic data were used inside "use cache".",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": "app/static/page.tsx (6:1) @ getCachedData
         > 6 | async function getCachedData(): Promise<string> {
             | ^",
           "stack": [
             "getCachedData app/static/page.tsx (6:1)",
             "Cached app/static/page.tsx (18:24)",
             "Page app/static/page.tsx (32:10)",
           ],
         }
        `)
      })
    })

    describe('when navigating to the runtime page', () => {
      it('should show an error toast after a timeout', async () => {
        const outputIndex = next.cliOutput.length
        const browser = await next.browser('/')

        await browser.elementByCss('a[href="/runtime"]').click()

        await retry(() => {
          const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

          expect(cliOutput).toContain(`Error: ${expectedTimeoutErrorMessage}
    at getCachedData (app/runtime/page.tsx:8:1)`)
        }, 20_000)

        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E236",
           "description": "Filling a cache during prerender timed out, likely because request-specific arguments such as params, searchParams, cookies() or dynamic data were used inside "use cache".",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": "app/runtime/page.tsx (8:1) @ getCachedData
         >  8 | async function getCachedData(): Promise<string> {
              | ^",
           "stack": [
             "getCachedData app/runtime/page.tsx (8:1)",
             "Cached app/runtime/page.tsx (20:24)",
             "Page app/runtime/page.tsx (42:7)",
           ],
         }
        `)
      })
    })

    describe('when a "use cache" performs long-running I/O in the dynamic stage', () => {
      it('should not time out', async () => {
        const outputIndex = next.cliOutput.length
        const browser = await next.browser('/dynamic')

        await expect(browser.elementByCss('#cached').text()).resolves.toBe(
          'cached'
        )

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        expect(cliOutput).not.toContain(expectedTimeoutErrorMessage)
      })
    })
  } else {
    describe('when a "use cache" fill hangs during prerendering', () => {
      it('should fail the build with a timeout error', async () => {
        try {
          await next.start()
        } catch {
          // expected
        }

        if (isTurbopack) {
          expect(next.cliOutput)
            .toContain(`Error: ${expectedTimeoutErrorMessage}
    at <unknown> (app/static/page.tsx:6:1)`)
        } else {
          // Webpack production builds don't have source maps by default.
          expect(next.cliOutput).toContain(expectedTimeoutErrorMessage)
        }
      })
    })
  }
})
