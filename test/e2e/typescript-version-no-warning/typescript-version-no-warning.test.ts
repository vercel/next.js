import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('typescript-version-no-warning', () => {
  const { next, isNextDeploy, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

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
