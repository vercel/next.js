import { nextTestSetup } from 'e2e-utils'
import {
  waitForRedbox,
  getRedboxDescription,
  getRedboxSource,
} from 'next-test-utils'

describe('cache-components-route-handler-errors', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it("should error when route handlers use segment configs that aren't supported by cacheComponents", async () => {
    if (isNextDev) {
      await next.start()

      // Test the first route handler with "dynamic" config
      const browser = await next.browser('/route-with-dynamic')
      await waitForRedbox(browser)
      const redbox = {
        description: await getRedboxDescription(browser),
        source: await getRedboxSource(browser),
      }

      if (isTurbopack) {
        expect(redbox.description).toMatchInlineSnapshot(
          `"Route segment config "dynamic" is not compatible with \`nextConfig.cacheComponents\`. Please remove it. Read more: https://nextjs.org/docs/app/guides/migrating-to-cache-components"`
        )
      } else {
        expect(redbox.description).toMatchInlineSnapshot(
          `"  x Route segment config "dynamic" is not compatible with \`nextConfig.cacheComponents\`. Please remove it. Read more: https://nextjs.org/docs/app/guides/migrating-to-cache-components"`
        )
      }
      expect(redbox.source).toContain(
        '"dynamic" is not compatible with `nextConfig.cacheComponents`. Please remove it. Read more: https://nextjs.org/docs/app/guides/migrating-to-cache-components'
      )
      // Both invalid exports should be reported without fixing one first.
      expect(next.cliOutput).toContain(
        '"runtime" is not compatible with `nextConfig.cacheComponents`. Please remove it. Read more: https://nextjs.org/docs/app/guides/migrating-to-cache-components'
      )
    } else {
      await expect(next.start()).rejects.toThrow()

      // In build mode, check every incompatible export, including both in one handler.
      expect(next.cliOutput).toContain('./app/route-with-dynamic/route.ts')
      expect(next.cliOutput).toContain(
        '"runtime" is not compatible with `nextConfig.cacheComponents`. Please remove it. Read more: https://nextjs.org/docs/app/guides/migrating-to-cache-components'
      )
      expect(next.cliOutput).toContain(
        '"dynamic" is not compatible with `nextConfig.cacheComponents`. Please remove it. Read more: https://nextjs.org/docs/app/guides/migrating-to-cache-components'
      )

      expect(next.cliOutput).toContain('./app/route-with-revalidate/route.ts')
      expect(next.cliOutput).toContain(
        '"revalidate" is not compatible with `nextConfig.cacheComponents`. Please remove it. Read more: https://nextjs.org/docs/app/guides/migrating-to-cache-components'
      )

      expect(next.cliOutput).toContain('./app/route-with-fetchcache/route.ts')
      expect(next.cliOutput).toContain(
        '"fetchCache" is not compatible with `nextConfig.cacheComponents`. Please remove it. Read more: https://nextjs.org/docs/app/guides/migrating-to-cache-components'
      )
    }
  }, 240_000)
})
