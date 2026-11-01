import { gate } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe('Side-effect imports with noUncheckedSideEffectImports', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: { sass: '1.54.0' },
    skipStart: true,
  })

  let buildResult: Awaited<ReturnType<(typeof next)['build']>>
  beforeAll(async () => {
    buildResult = await next.build()
  })

  it('Should build without typescript errors', async () => {
    if (await gate((c) => c.futureCompat)) {
      expect(buildResult.exitCode).toBe(1)
      expect(buildResult.cliOutput).toContain("code: 'DEP0144'")
      expect(buildResult.cliOutput).toContain('at requireFromString')
      return
    }
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
