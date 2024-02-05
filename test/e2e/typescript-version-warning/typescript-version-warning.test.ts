import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'typescript-version-warning',
  {
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
    dependencies: {
      typescript: '4.0.6',
    },
  },
  ({ next, isNextDeploy, isNextDev }) => {
    if (isNextDeploy || isNextDev) {
      it('should skip', () => {})
      return
    }

    it('should print warning when old typescript version is used with next build', async () => {
      await next.start().catch(() => {})
      expect(next.cliOutput).toContain(
        'Minimum recommended TypeScript version is v4.5.2, older versions can potentially be incompatible with Next.js. Detected: 4.0.6'
      )
    })
  }
)
