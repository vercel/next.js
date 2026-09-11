import { nextTestSetup } from 'e2e-utils'

// This fixture deliberately uses an old TypeScript version and inspects build diagnostics.
// Its compiler rejects the production build, so deployment setup cannot complete.
// @force-gate !deploy
describe('typescript-version-warning', () => {
  const { next, isNextDeploy, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: {
      typescript: '4.0.6',
    },
  })

  if (isNextDeploy || isNextDev) {
    it('should skip', () => {})
    return
  }

  it('should print warning when old typescript version is used with next build', async () => {
    await next.start().catch(() => {})
    expect(next.cliOutput).toContain(
      'Minimum recommended TypeScript version is v5.1.0, older versions can potentially be incompatible with Next.js. Detected: 4.0.6'
    )
  })
})
