import { createNextDescribe } from 'e2e-utils'
import { check, nextBuild } from 'next-test-utils'

const isNextDev = Boolean((global as any).isNextDev)
const expectedErr =
  /Webpack config is undefined. You may have forgot to return properly from within the "webpack" method of your next.config.js/

// createNextDescribe doesn't support failing builds currently. This test has a failing build in production.
if (isNextDev) {
  createNextDescribe(
    'undefined-webpack-config',
    {
      files: __dirname,
    },
    ({ next }) => {
      it('should show in dev mode', async () => {
        await check(() => next.cliOutput, expectedErr)
      })
    }
  )
} else {
  describe('undefined webpack config error', () => {
    it('should show in production mode', async () => {
      const result = await nextBuild(__dirname, [], {
        stdout: true,
        stderr: true,
      })
      expect(result.stderr || '' + result.stdout || '').toMatch(expectedErr)
    })
  })
}
