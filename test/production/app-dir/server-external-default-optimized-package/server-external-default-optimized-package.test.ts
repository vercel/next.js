import { nextTestSetup } from 'e2e-utils'

describe('serverExternalPackages with a default optimized package', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('builds without a transpilePackages conflict', async () => {
    const { exitCode, cliOutput } = await next.build()
    expect(cliOutput).not.toContain(
      "conflict with the 'serverExternalPackages'"
    )
    expect(exitCode).toBe(0)
  })
})
