import { nextTestSetup } from 'e2e-utils'

describe('instrumentation-conflict', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  it('should throw an error when both root and src instrumentation files exist', async () => {
    await expect(() => next.start()).rejects.toThrow()

    expect(next.cliOutput).toContain(
      'Conflicting instrumentation files detected'
    )
  })
})
