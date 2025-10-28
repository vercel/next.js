import { isNextDev, nextTestSetup } from 'e2e-utils'

describe('Cache Components Errors', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/unstable-deprecations',
  })

  if (skipped) {
    return
  }

  describe('Deprecating `unstable` prefix for `cacheLife` and `cacheTag`', () => {
    it('warns if you use `cacheLife` through `unstable_cacheLife`', async () => {
      if (isNextDev) {
        await next.browser('/life')

        expect(next.cliOutput).toContain(
          'Error: `unstable_cacheLife` was recently stabilized'
        )
      } else {
        expect(next.cliOutput).toContain(
          'Error: `unstable_cacheLife` was recently stabilized'
        )
      }
    })
    it('warns if you use `cacheTag` through `unstable_cacheTag`', async () => {
      if (isNextDev) {
        await next.browser('/tag')

        expect(next.cliOutput).toContain(
          'Error: `unstable_cacheTag` was recently stabilized'
        )
      } else {
        expect(next.cliOutput).toContain(
          'Error: `unstable_cacheTag` was recently stabilized'
        )
      }
    })
  })
})
