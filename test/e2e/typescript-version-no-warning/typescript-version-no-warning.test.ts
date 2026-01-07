import { nextTestSetup } from 'e2e-utils'

describe('typescript-version-no-warning', () => {
  const { next, isNextDeploy, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isNextDeploy || isNextDev) {
    it('should skip', () => {})
    return
  }

  it('should not print warning when new typescript version is used with next build', async () => {
    await next.start().catch(() => {})
    expect(next.cliOutput).not.toContain(
      'Minimum recommended TypeScript version is'
    )
  })
})
