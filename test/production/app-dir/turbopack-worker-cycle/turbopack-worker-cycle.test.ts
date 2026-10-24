import { nextTestSetup } from 'e2e-utils'

describe('turbopack-worker-cycle', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (!isTurbopack) {
    it('is turbopack-only', () => {})
    return
  }

  it('reports a recursive worker chunk instead of hanging', async () => {
    const { exitCode, cliOutput } = await next.runCommand(['build'], {
      signal: AbortSignal.timeout(120_000),
    })

    expect(exitCode).toBe(1)
    expect(cliOutput).toContain('recursive worker entry point')
  }, 150_000)
})
