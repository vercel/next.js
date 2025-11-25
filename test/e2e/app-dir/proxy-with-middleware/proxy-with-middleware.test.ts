import { nextTestSetup } from 'e2e-utils'

describe('proxy-with-middleware', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  it('should error when both middleware and proxy files are detected', async () => {
    const message =
      'Both middleware file "./middleware.ts" and proxy file "./proxy.ts" are detected. Please use "./proxy.ts" only.'

    if (isNextDev) {
      await next.start().catch(() => {})
      expect(next.cliOutput).toContain(message)
    } else {
      const { cliOutput } = await next.build()
      expect(cliOutput).toContain(message)
    }
  })
})
