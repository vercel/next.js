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
    describe(option, () => {
      const { next, isTurbopack, isNextDev } = nextTestSetup({
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

      if (!isNextDev) {
        it('error on old option on build', async () => {
          await expect(next.start()).rejects.toThrow()
          expect(next.cliOutput).toContain(error)
        }, 240_000)
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
