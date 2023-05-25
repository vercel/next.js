import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir action invalid config',
  {
    files: __dirname,
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
        experimental: {},
      }
      `
      )
      try {
        await next.build()
      } catch {}
    })

    it('should error if serverActions is not enabled', async () => {
      expect(next.cliOutput).toContain(
        'Server Actions require `experimental.serverActions` option'
      )
    })
  }
)
