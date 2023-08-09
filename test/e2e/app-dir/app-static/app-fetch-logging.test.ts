import path from 'path'
import stripAnsi from 'strip-ansi'
import { check } from 'next-test-utils'
import { createNextDescribe, FileRef } from 'e2e-utils'

function parseLogsFromCli(cliOutput: string) {
  return stripAnsi(cliOutput)
    .split('\n')
    .filter((log) => log.includes('ms (cache:'))
    .map((log) => {
      const trimmedLog = log.replace(/^[^a-zA-Z]+/, '')
      const parts = trimmedLog.split(' ')
      const method = parts[0]
      const url = parts[1]
      const statusCode = parseInt(parts[2])
      const responseTime = parseInt(parts[4])
      const cache = parts.slice(5).join(' ')

      return {
        method,
        url,
        statusCode,
        responseTime,
        cache,
      }
    })
}

createNextDescribe(
  'app-dir - data fetching with cache logging',
  {
    skipDeployment: true,
    files: {
      'app/layout.js': new FileRef(path.join(__dirname, 'app/layout.js')),
      'app/default-cache/page.js': new FileRef(
        path.join(__dirname, 'app/default-cache/page.js')
      ),
      'next.config.js': `module.exports = { experimental: { logging: 'verbose' } }`,
    },
  },
  ({ next, isNextDev }) => {
    describe('with verbose logging', () => {
      it('should only log requests in dev mode', async () => {
        const outputIndex = next.cliOutput.length
        await next.fetch('/default-cache')

        await check(() => {
          const logs = stripAnsi(next.cliOutput.slice(outputIndex))
          const hasLogs = logs.includes('GET /default-cache 200')

          if (isNextDev && hasLogs) {
            return 'success'
          }

          if (!isNextDev && !hasLogs) {
            return 'success'
          }
        }, 'success')
      })

      if (isNextDev) {
        it("should log 'skip' cache status with a reason when cache: 'no-cache' is used", async () => {
          const outputIndex = next.cliOutput.length
          await next.fetch('/default-cache')

          await check(() => {
            const logs = parseLogsFromCli(next.cliOutput.slice(outputIndex))

            const logEntry = logs.find((log) =>
              log.url.includes('api/random?no-cache')
            )

            if (logEntry?.cache === '(cache: SKIP, reason: cache: no-cache)') {
              return 'success'
            }
          }, 'success')
        })

        it("should log 'skip' cache status with a reason when revalidate: 0 is used", async () => {
          const outputIndex = next.cliOutput.length
          await next.fetch('/default-cache')
          await check(() => {
            const logs = parseLogsFromCli(next.cliOutput.slice(outputIndex))

            const logEntry = logs.find((log) =>
              log.url.includes('api/random?revalidate-0')
            )

            if (logEntry?.cache === '(cache: SKIP, reason: revalidate: 0)') {
              return 'success'
            }
          }, 'success')
        })

        it("should log 'skip' cache status with a reason when the browser indicates caching should be ignored", async () => {
          const outputIndex = next.cliOutput.length
          await next.fetch('/default-cache', {
            headers: { 'Cache-Control': 'no-cache' },
          })
          await check(() => {
            const logs = parseLogsFromCli(next.cliOutput.slice(outputIndex))

            const logEntry = logs.find((log) =>
              log.url.includes('api/random?auto-cache')
            )

            if (
              logEntry?.cache ===
              '(cache: SKIP, reason: cache-control: no-cache (hard refresh))'
            ) {
              return 'success'
            }
          }, 'success')
        })
      }
    })

    describe('with default logging', () => {
      beforeAll(async () => {
        await next.stop()
        await next.deleteFile('next.config.js')
        await next.start()
      })

      it('should not log fetch requests at all', async () => {
        const outputIndex = next.cliOutput.length
        await next.fetch('/default-cache')

        await check(() => {
          const logs = stripAnsi(next.cliOutput.slice(outputIndex))
          if (logs.includes('GET /default-cache 200')) {
            return 'fail'
          }

          return 'success'
        }, 'success')
      })
    })
  }
)
