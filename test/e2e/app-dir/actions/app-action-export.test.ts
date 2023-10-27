import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir action handling - next export',
  {
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
      'server-only': 'latest',
    },
  },
  ({ next, isNextStart }) => {
    if (!isNextStart) {
      it('skip test for dev mode', () => {})
      return
    }

    beforeAll(async () => {
      await next.stop()
      await next.patchFile(
        'next.config.js',
        `
      module.exports = {
        output: 'export'
      }
      `
      )
      try {
        await next.start()
      } catch {}
    })

    it('should error when use export output for server actions', async () => {
      expect(next.cliOutput).toContain(
        `Server Actions are not supported with static export.`
      )
    })
  }
)
