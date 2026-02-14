import { nextTestSetup } from 'e2e-utils'

describe('instrumentation-conflict-build', () => {
  const { skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeploy: true,
  })

  if (skipped) {
    return
  }

  it('should throw an error during build when both root and src instrumentation files exist', async () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeploy: true,
    })

    await expect(next.build()).rejects.toThrow(
      /Conflicting instrumentation files detected/
    )
  })
})
