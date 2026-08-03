import { nextTestSetup } from 'e2e-utils'

describe('turbopack `raw` module type imported for its bindings', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (!isTurbopack) {
    it('is turbopack-only', () => {})
    return
  }

  it('should report an error instead of silently evaluating to undefined', async () => {
    const { cliOutput, exitCode } = await next.build()

    expect(exitCode).not.toBe(0)
    expect(cliOutput).toContain('alpha.md')
    expect(cliOutput).toContain('has no ECMAScript exports')
  })
})
