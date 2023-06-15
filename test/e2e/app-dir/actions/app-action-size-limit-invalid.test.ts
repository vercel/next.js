import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir action size limit invalid config',
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

    beforeAll(async function () {
      await next.stop()
      await next.patchFile(
        'next.config.js',
        `
      module.exports = {
        experimental: {
          serverActions: true,
          serverActionsSizeLimit: -3000,
        },
      }
      `
      )
      try {
        await next.build()
      } catch {}
    })

    beforeAll(async function () {
      await next.stop()
      await next.patchFile(
        'next.config.js',
        `
      module.exports = {
        experimental: {
          serverActions: true,
          serverActionsSizeLimit: 'testmb',
        },
      }
      `
      )
      try {
        await next.build()
      } catch {}
    })

    beforeAll(async function () {
      await next.stop()
      await next.patchFile(
        'next.config.js',
        `
      module.exports = {
        experimental: {
          serverActions: true,
          serverActionsSizeLimit: '-3000mb',
        },
      }
      `
      )
      try {
        await next.build()
      } catch {}
    })

    it('should error if serverActions is not enabled', async function () {
      expect(next.cliOutput).toContain(
        'Server Actions Size Limit must exceed 1 in number or filesize format'
      )
    })
  }
)
