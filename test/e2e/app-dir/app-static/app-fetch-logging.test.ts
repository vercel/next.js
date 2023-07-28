import path from 'path'
import { createNextDescribe, FileRef } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

function parseLogsFromCli(cliOutput: string) {
  return stripAnsi(cliOutput)
    .split('\n')
    .filter((log) => log.includes('├'))
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
        await next.fetch('/default-cache')
        const logs = stripAnsi(next.cliOutput)

        if (isNextDev) {
          expect(logs).toContain('GET /default-cache 200')
        } else {
          expect(logs).not.toContain('GET /default-cache 200')
        }

        await next.stop()
      })

      if (isNextDev) {
        it("should log 'skip' cache status with a reason when cache: 'no-cache' is used", async () => {
          await next.start()
          await next.fetch('/default-cache')
          const logs = parseLogsFromCli(next.cliOutput)
          const logEntry = logs.find((log) =>
            log.url.includes('api/random?no-cache')
          )

          expect(logEntry?.cache).toMatchInlineSnapshot(
            `"(cache: SKIP, reason: cache: no-cache)"`
          )
          await next.stop()
        })

        it("should log 'skip' cache status with a reason when revalidate: 0 is used", async () => {
          await next.start()
          await next.fetch('/default-cache')
          const logs = parseLogsFromCli(next.cliOutput)
          const logEntry = logs.find((log) =>
            log.url.includes('api/random?revalidate-0')
          )

          expect(logEntry?.cache).toMatchInlineSnapshot(
            `"(cache: SKIP, reason: revalidate: 0)"`
          )
          await next.stop()
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
        await next.fetch('/default-cache')
        const logs = stripAnsi(next.cliOutput)

        expect(logs).not.toContain('GET /default-cache 200')
      })
    })
  }
)
