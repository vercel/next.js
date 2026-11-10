import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('proxy-with-middleware', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should error when both middleware and proxy files are detected', async () => {
    const message =
      'Both middleware file "./middleware.ts" and proxy file "./proxy.ts" are detected. Please use "./proxy.ts" only.'

    if (isNextDev) {
      await next.start().catch(() => {})
      await retry(async () => {
        expect(next.cliOutput).toContain(message)
      })
    } else {
      await expect(next.start()).rejects.toThrow()
      const cliOutput = next.cliOutput
      expect(cliOutput).toContain(message)
    }
  }, 240_000)
})
