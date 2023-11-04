import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

const CONFIG_ERROR =
  'Server Actions Size Limit must be a valid number or filesize format lager than 1MB'

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
  ({ next, isNextStart, isNextDeploy }) => {
    if (!isNextStart) {
      it('skip test for dev mode', () => {})
      return
    }

    it('should error if serverActions.bodySizeLimit config is a negative number', async function () {
      await next.patchFile(
        'next.config.js',
        `
      module.exports = {
        experimental: {
          serverActions: { bodySizeLimit: -3000 }
        },
      }
      `
      )
      await next.stop()
      try {
        await next.build()
      } catch {}
      expect(next.cliOutput).toContain(CONFIG_ERROR)
    })

    it('should error if serverActions.bodySizeLimit config is invalid', async function () {
      await next.patchFile(
        'next.config.js',
        `
      module.exports = {
        experimental: {
          serverActions: { bodySizeLimit: 'testmb' }
        },
      }
      `
      )
      await next.stop()
      try {
        await next.build()
      } catch {}
      expect(next.cliOutput).toContain(CONFIG_ERROR)
    })

    it('should error if serverActions.bodySizeLimit config is a negative size', async function () {
      await next.patchFile(
        'next.config.js',
        `
      module.exports = {
        experimental: {
          serverActions: { bodySizeLimit: '-3000mb' }
        },
      }
      `
      )
      await next.stop()
      try {
        await next.build()
      } catch {}
      expect(next.cliOutput).toContain(CONFIG_ERROR)
    })

    if (!isNextDeploy) {
      it('should respect the size set in serverActions.bodySizeLimit', async function () {
        await next.patchFile(
          'next.config.js',
          `
      module.exports = {
        experimental: {
          serverActions: { bodySizeLimit: '1.5mb' }
        },
      }
      `
        )
        await next.build()
        await next.start()

        const logs: string[] = []
        next.on('stdout', (log) => {
          logs.push(log)
        })
        next.on('stderr', (log) => {
          logs.push(log)
        })

        const browser = await next.browser('/file')
        await browser.elementByCss('#size-1mb').click()

        await check(() => {
          return logs.some((log) => log.includes('size = 1048576')) ? 'yes' : ''
        }, 'yes')

        await browser.elementByCss('#size-2mb').click()

        await check(() => {
          const fullLog = logs.join('')
          return fullLog.includes('[Error]: Body exceeded 1.5mb limit') &&
            fullLog.includes(
              'To configure the body size limit for Server Actions, see'
            )
            ? 'yes'
            : ''
        }, 'yes')
      })
    }
  }
)
