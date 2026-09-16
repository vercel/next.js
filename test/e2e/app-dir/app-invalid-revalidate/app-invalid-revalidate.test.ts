import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import path from 'path'

describe.each(['layout', 'page', 'fetch', 'unstable-cache'])(
  'app-invalid-revalidate (%s)',
  (fixture) => {
    const { next, isNextDev } = nextTestSetup({
      files: path.join(__dirname, 'fixtures', fixture),
      skipStart: true,
      expectDeploymentFailure: true,
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
      await next.start().catch(() => {})

      if (isNextDev) {
        await next.fetch('/')
      }

      await retry(() => {
        expect(next.cliOutput).toMatch(
          fixture === 'unstable-cache'
            ? /Invalid revalidate value "1" on "unstable_cache/
            : /Invalid revalidate value "1" on "\/", must be a non-negative number or false/
        )
      })
    })
  }
)
