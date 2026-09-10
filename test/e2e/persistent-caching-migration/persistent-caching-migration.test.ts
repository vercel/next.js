import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const CASES = [
  [
    'turbopackPersistentCaching',
    "Use 'experimental.turbopackFileSystemCacheForDev' instead.",
  ],
  [
    'turbopackPersistentCachingForDev',
    "Use 'experimental.turbopackFileSystemCacheForDev' instead.",
  ],
  [
    'turbopackPersistentCachingForBuild',
    "Use 'experimental.turbopackFileSystemCacheForBuild' instead.",
  ],
]

describe('persistent-caching-migration', () => {
  for (const [option, error] of CASES) {
    // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
    // It likely expects a local build failure instead of a successful deployment.
    // @force-gate !deploy
    describe(option, () => {
      const { next, isTurbopack, isNextStart } = nextTestSetup({
        files: {
          'next.config.js': `module.exports = {
  experimental: {
    ${option}: true,
  },
}`,
        },
        skipStart: true,
      })

      if (!isTurbopack) {
        it.skip('only for turbopack', () => {})
        return
      }

      if (isNextStart) {
        it('error on old option on build', async () => {
          let { exitCode, cliOutput } = await next.build()
          expect(exitCode).toBe(1)
          expect(cliOutput).toContain(error)
        })
      } else {
        it('error on old option in dev', async () => {
          await next.start()
          await retry(async () => {
            expect(next.cliOutput).toContain(error)
          })
        })
      }
    })
  }
})
