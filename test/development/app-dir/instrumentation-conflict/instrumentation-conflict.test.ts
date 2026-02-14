import { nextTestSetup } from 'e2e-utils'

describe('instrumentation-conflict', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  it('should throw an error when both root and src instrumentation files exist', async () => {
    if (isNextDev) {
      await expect(next.start()).rejects.toThrow(
        /Conflicting instrumentation files detected/
      )
    } else {
      // For production builds, the error should be thrown during build
      await expect(next.build()).rejects.toThrow(
        /Conflicting instrumentation files detected/
      )
    }
  })
})
