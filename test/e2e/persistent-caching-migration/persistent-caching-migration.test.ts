import { nextTestSetup } from 'e2e-utils'

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
    describe(option, () => {
      const { skipped, next, isTurbopack, isNextStart } = nextTestSetup({
        files: {
          'next.config.js': `module.exports = {
  experimental: {
    ${option}: true,
  },
}`,
        },
        skipDeployment: true,
        skipStart: true,
      })

      if (skipped) {
        return
      }

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
          await expect(next.start()).toReject()
          expect(next.cliOutput).toContain(error)
        })
      }
    })
  }
})
