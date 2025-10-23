import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getRedboxDescription,
  getRedboxSource,
} from 'next-test-utils'

describe('cache-components-route-handler-errors', () => {
  const { next, skipped, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it("should error when route handlers use segment configs that aren't supported by cacheComponents", async () => {
    try {
      await next.start()
    } catch {
      // we expect the build to fail
    }

    if (isNextDev) {
      // Test the first route handler with "dynamic" config
      const browser = await next.browser('/route-with-dynamic')
      await assertHasRedbox(browser)
      const redbox = {
        description: await getRedboxDescription(browser),
        source: await getRedboxSource(browser),
      }

      if (isTurbopack) {
        expect(redbox.description).toMatchInlineSnapshot(
          `"Ecmascript file had an error"`
        )
      } else {
        expect(redbox.description).toMatchInlineSnapshot(
          `"  x Route segment config "dynamic" is not compatible with \`nextConfig.cacheComponents\`. Please remove it."`
        )
      }
      expect(redbox.source).toContain(
        '"dynamic" is not compatible with `nextConfig.cacheComponents`. Please remove it.'
      )
    } else {
      // In build mode, check for all three errors in the output
      expect(next.cliOutput).toContain('./app/route-with-dynamic/route.ts')
      expect(next.cliOutput).toContain(
        '"dynamic" is not compatible with `nextConfig.cacheComponents`. Please remove it.'
      )

      expect(next.cliOutput).toContain('./app/route-with-revalidate/route.ts')
      expect(next.cliOutput).toContain(
        '"revalidate" is not compatible with `nextConfig.cacheComponents`. Please remove it.'
      )

      expect(next.cliOutput).toContain('./app/route-with-fetchcache/route.ts')
      expect(next.cliOutput).toContain(
        '"fetchCache" is not compatible with `nextConfig.cacheComponents`. Please remove it.'
      )
    }
  })
})
