import { nextTestSetup } from 'e2e-utils'

describe('persistent-caching-migration', () => {
  const { skipped, next, isTurbopack, isNextStart } = nextTestSetup({
    files: __dirname,
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
    it('error on old option', async () => {
      let { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain(
        "Use 'experimental.turbopackPersistentCachingForDev' instead."
      )
    })
  } else {
    it('success on new option', async () => {
      await expect(next.start()).toReject()
      expect(next.cliOutput).toContain(
        "Use 'experimental.turbopackPersistentCachingForDev' instead."
      )
    })
  }
})
