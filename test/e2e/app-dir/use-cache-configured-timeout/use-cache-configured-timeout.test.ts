import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

const expectedTimeoutErrorMessage =
  'Filling a cache during prerender timed out, likely because request-specific arguments such as params, searchParams, cookies() or dynamic data were used inside "use cache".'

describe('use-cache-configured-timeout', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: process.env.NEXT_TEST_MODE !== 'dev',
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    describe('when a "use cache" fill is below the configured dev `useCacheTimeout`', () => {
      it('should not clamp the dev timeout and allow the cache fill to complete', async () => {
        const outputIndex = next.cliOutput.length
        const browser = await next.browser('/below-dev-timeout')

        await expect(browser.elementByCss('#result').text()).resolves.toBe(
          'cached'
        )

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        expect(cliOutput).not.toContain(expectedTimeoutErrorMessage)
      })
    })

    describe('when a "use cache" fill exceeds the configured dev `useCacheTimeout`', () => {
      it('should apply the configured timeout and show the error', async () => {
        const outputIndex = next.cliOutput.length
        const browser = await next.browser('/above-dev-timeout')

        await expect(browser).toDisplayRedbox(`
         {
           "code": "E236",
           "description": "Filling a cache during prerender timed out, likely because request-specific arguments such as params, searchParams, cookies() or dynamic data were used inside "use cache".",
           "environmentLabel": "Prerender",
           "label": "Runtime Error",
           "source": "app/above-dev-timeout/page.tsx (4:1) @ getCachedData
         > 4 | async function getCachedData(): Promise<string> {
             | ^",
           "stack": [
             "getCachedData app/above-dev-timeout/page.tsx (4:1)",
             "Cached app/above-dev-timeout/page.tsx (13:22)",
             "Page app/above-dev-timeout/page.tsx (19:10)",
           ],
         }
        `)

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        expect(cliOutput).toContain(expectedTimeoutErrorMessage)
      })
    })
  } else {
    describe('when `experimental.useCacheTimeout` exceeds `staticPageGenerationTimeout` during prerendering', () => {
      it('should clamp the build timeout and fail both pages with a timeout error', async () => {
        try {
          await next.start()
        } catch {
          // expected
        }

        expect(next.cliOutput).toContain(expectedTimeoutErrorMessage)
        expect(next.cliOutput).toContain(
          'Error occurred prerendering page "/below-dev-timeout"'
        )
        expect(next.cliOutput).toContain(
          'Error occurred prerendering page "/above-dev-timeout"'
        )
      })
    })
  }
})
