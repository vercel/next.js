import { nextTestSetup } from 'e2e-utils'

describe('Side-effect imports with noUncheckedSideEffectImports', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    dependencies: { sass: '1.54.0' },
    skipDeployment: true, // No need to run this in deployment mode.
    skipStart: true,
  })
  if (skipped) return

  let buildResult: Awaited<ReturnType<(typeof next)['build']>>
  beforeAll(async () => {
    buildResult = await next.build()
  })

  it('Should build without typescript errors', async () => {
    // If something's wrong with our declarations of these modules, TSC will error with:
    //   `Type error: Cannot find module '...' or its corresponding type declarations.`
    expect(buildResult.cliOutput).not.toContain('server-only')
    expect(buildResult.cliOutput).not.toContain('client-only')
    expect(buildResult.cliOutput).not.toContain('globals.css')
    expect(buildResult.cliOutput).not.toContain('globals.sass')
    expect(buildResult.cliOutput).not.toContain('globals.scss')
    expect(buildResult.exitCode).toBe(0)
  })
})
