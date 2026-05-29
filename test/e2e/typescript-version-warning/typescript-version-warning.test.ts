import { nextTestSetup } from 'e2e-utils'

describe('typescript-version-warning', () => {
  const { next, isNextDeploy, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
    dependencies: {
      typescript: '4.0.6',
    },
  })

  if (skipped) {
    return
  }

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
