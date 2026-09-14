import { nextTestSetup } from 'e2e-utils'

describe('JSON Serialization', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
    })
    if (skipped) return

    test('should fail with original error', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(1)
      expect(next.cliOutput).toContain('Do not know how to serialize a BigInt')
    })
  })
})
