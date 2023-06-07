import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'typescript-version-no-warning',
  {
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  },
  ({ next, isNextDeploy, isNextDev }) => {
    if (isNextDeploy || isNextDev) {
      it('should skip', async () => {
        expect(1).toBe(1)
      })
    } else {
      it('should not print warning when new typescript version is used with next build', async () => {
        await next.start().catch(() => {})
        expect(next.cliOutput).not.toContain(
          'Minimum recommended TypeScript version is'
        )
      })
    }
  }
)
