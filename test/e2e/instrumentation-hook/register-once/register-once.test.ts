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
})
