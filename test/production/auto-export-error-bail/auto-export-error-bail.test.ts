import { nextTestSetup } from 'e2e-utils'

// This suite controls the local build lifecycle directly, which deployment tests cannot reproduce.
// @force-gate !deploy
describe('Auto Export _error bail', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

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
