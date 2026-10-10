import { nextTestSetup } from 'e2e-utils'

describe('import.meta.glob matching a file without a module type', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (!isTurbopack) {
    it('is turbopack-only', () => {})
    return
  }

  it('should say which glob matched the file', async () => {
    const { cliOutput, exitCode } = await next.build()

    expect(exitCode).not.toBe(0)
    expect(cliOutput).toContain('gamma.txt')
    // The call site, so the glob that pulled the file in can be found.
    expect(cliOutput).toContain('app/x-txt/page.tsx')
    expect(cliOutput).toContain('import.meta.glob')
  })

  it('should link to the current webpack loaders documentation', async () => {
    const { cliOutput } = await next.build()

    expect(cliOutput).toContain(
      'https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#configuring-webpack-loaders'
    )
  })
})
