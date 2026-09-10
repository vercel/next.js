import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

const timeoutErrorMessage =
  'A `"use cache"` function took too long during prerendering. The most common cause is passing unresolved request-specific arguments, such as `params` or `searchParams`, into the cached function. Resolve the data before calling the function and pass only the values you need.\nLearn more: https://nextjs.org/docs/messages/next-request-in-use-cache'

function expectedTimeoutErrorMessage(route: string) {
  return `Route "${route}": ${timeoutErrorMessage}`
}

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('use-cache-configured-timeout', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: process.env.NEXT_TEST_MODE !== 'dev',
  })

  if (isNextDev) {
    describe('when a "use cache" fill is below the configured dev `useCacheTimeout`', () => {
      it('should not clamp the dev timeout and allow the cache fill to complete', async () => {
        const outputIndex = next.cliOutput.length
        const browser = await next.browser('/below-dev-timeout')

        await expect(browser.elementByCss('#result').text()).resolves.toBe(
          'cached'
        )

        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        expect(cliOutput).not.toContain(timeoutErrorMessage)
      })
    })

    describe('when a "use cache" fill exceeds the configured dev `useCacheTimeout`', () => {
      it('should apply the configured timeout and show the error', async () => {
        const outputIndex = next.cliOutput.length
        const browser = await next.browser('/above-dev-timeout')

        await expect(browser).toDisplayRedbox(`
         {
           "description": "Route "/above-dev-timeout": A \`"use cache"\` function took too long during prerendering. The most common cause is passing unresolved request-specific arguments, such as \`params\` or \`searchParams\`, into the cached function. Resolve the data before calling the function and pass only the values you need.
         Learn more: https://nextjs.org/docs/messages/next-request-in-use-cache",
           "environmentLabel": "Cache",
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

        expect(cliOutput).toContain(
          expectedTimeoutErrorMessage('/above-dev-timeout')
        )
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

        expect(next.cliOutput).toContain(timeoutErrorMessage)
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
