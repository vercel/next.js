import { nextTestSetup } from 'e2e-utils'

describe('importing bindings from a module with no ECMAScript exports', () => {
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
    expect(cliOutput).toContain('fake.node')
    expect(cliOutput).toContain('has no ECMAScript exports')
  })
})
