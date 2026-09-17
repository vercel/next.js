import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app dir - instant-validation-client', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should error when a client component exports instant', async () => {
    const expectedErrMsg = `"instant" is a route segment config and can only be used when the segment is a Server Component module. Remove the "use client" directive`

    if (isNextDev) {
      await next.start().catch(() => {})
      await next.browser('/').catch(() => {})
      await retry(async () => {
        expect(next.cliOutput).toContain(expectedErrMsg)
      })
    } else {
      await expect(next.start()).rejects.toThrow()
      const cliOutput = next.cliOutput
      expect(cliOutput).toContain(expectedErrMsg)
    }
  }, 240_000)
})
