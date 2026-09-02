import { nextTestSetup } from 'e2e-utils'

describe('typescript-build-output', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (isNextDeploy) {
    it('should skip', () => {})
    return
  }

  it('should show "Finished TypeScript" message in build output', async () => {
    await next.build()
    expect(next.cliOutput).toContain('Finished TypeScript')
  })
})
