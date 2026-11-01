import { gate } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe('turbopack-module-graph-cycle', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('reports compilation issues for a module cycle without panicking', async () => {
    const { exitCode, cliOutput } = await next.build()
    if (await gate((c) => c.futureCompat)) {
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain("code: 'DEP0144'")
      expect(cliOutput).toContain('at requireFromString')
      return
    }

    expect(exitCode).toBe(1)
    expect(cliOutput).toContain("Can't resolve './missing.css'")
    expect(cliOutput).not.toContain('there must be a path to a root')
    expect(cliOutput).not.toContain('Module graph is missing an entry point')
  })
})
