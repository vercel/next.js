import { nextTestSetup } from 'e2e-utils'

describe('typescript-build-output', () => {
  const { next, isNextDeploy, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isNextDeploy) {
    it('should skip', () => {})
    return
  }

  it('should show "Finished TypeScript" message in build output', async () => {
    await next.build()
    expect(next.cliOutput).toContain('Finished TypeScript')
  })
})
