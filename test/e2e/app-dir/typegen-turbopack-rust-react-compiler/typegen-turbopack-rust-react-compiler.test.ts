import { nextTestSetup } from 'e2e-utils'
import { runNextCommand } from 'next-test-utils'

describe('typegen with turbopack rust react compiler', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  it('generates route types without requiring an active bundler', async () => {
    const { code, stdout, stderr } = await runNextCommand(
      ['typegen', next.testDir],
      { stderr: true, stdout: true }
    )

    expect(code).toBe(0)
    expect(stdout + stderr).not.toContain('turbopackRustReactCompiler')

    const routeTypes = await next.readFile('.next/types/routes.d.ts')
    expect(routeTypes).toContain('type AppRoutes = "/"')
  })
})
