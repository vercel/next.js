import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('instrumentation-hook - register-once', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

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
