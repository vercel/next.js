import { nextTestSetup } from 'e2e-utils'

describe('instrumentation-hook - register-once', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should only register once', async () => {
    await next.fetch('/foo')
    expect(next.cliOutput).toIncludeRepeated('register-log', 1)
  })

  it('should not error when concurrent requests are made', async () => {
    await Promise.all([next.fetch('/foo'), next.fetch('/foo')])
    expect(next.cliOutput).toIncludeRepeated('register-log', 1)
    expect(next.cliOutput).not.toInclude('duplicated-register')
  })
})
