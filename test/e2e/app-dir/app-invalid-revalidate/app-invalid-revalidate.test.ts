import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import path from 'path'

describe.each(['layout', 'page', 'fetch', 'unstable-cache'])(
  'app-invalid-revalidate (%s)',
  (fixture) => {
    const { next, isNextDev } = nextTestSetup({
      files: path.join(__dirname, 'fixtures', fixture),
      skipStart: true,
      nextConfig: {
        typescript: {
          ignoreBuildErrors: true,
        },
        experimental: {
          prerenderEarlyExit: false,
        },
      },
    })

    it('reports the invalid revalidate value', async () => {
      if (isNextDev) {
        await next.start()
        await next.fetch('/')
      } else {
        await expect(next.start()).rejects.toThrow()
      }

      await retry(() => {
        expect(next.cliOutput).toMatch(
          fixture === 'unstable-cache'
            ? /Invalid revalidate value "1" on "unstable_cache/
            : /Invalid revalidate value "1" on "\/", must be a non-negative number or false/
        )
      })
    }, 240_000) // This test includes the build/deployment, not just runtime assertions.
  }
)
