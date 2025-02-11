import { nextTestSetup } from 'e2e-utils'

describe('no-mangling', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    buildOptions: ['--no-mangling'],
    skipStart: true,
  })

  it('should show original function names in stack traces', async () => {
    try {
      await next.build()
    } catch {
      // we expect the build to fail
    }

    // `Page` is the original function name that would be mangled if `next
    // build` was called without `--no-mangling`.
    expect(next.cliOutput).toInclude(`
Error: Kaputt!
    at Page`)
  })
})
