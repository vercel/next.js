import { nextTestSetup } from 'e2e-utils'

describe('Auto Export _error bail', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  it('should not opt-out of auto static optimization from invalid _error', async () => {
    const { exitCode, cliOutput } = await next.build()

    expect(exitCode).toBe(0)
    expect(cliOutput).not.toContain(
      'You have opted-out of Automatic Static Optimization due to'
    )
    expect(cliOutput).toContain(
      'The following reserved Next.js pages were detected not directly under the pages directory'
    )
    expect(cliOutput).toContain('/app/_error')
  })
})
