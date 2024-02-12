import path from 'path'
import fs from 'fs'
import stripAnsi from 'strip-ansi'
import { retry } from 'next-test-utils'
import { createNextDescribe } from 'e2e-utils'

function parseLogsFromCli(cliOutput: string) {
  const logs = stripAnsi(cliOutput)
    .split('\n')
    .filter((log) => log.includes('Cache missed reason') || log.includes('GET'))

  return logs.reduce((parsedLogs, log) => {
    if (log.includes('Cache missed reason')) {
      // cache miss reason
      const reasonSegment = log.split('Cache missed reason: ', 2)[1].trim()
      const reason = reasonSegment.slice(1, -1)
      parsedLogs[parsedLogs.length - 1].cache = reason
    } else {
      // request info
      const trimmedLog = log.replace(/^[^a-zA-Z]+/, '')
      const parts = trimmedLog.split(' ', 5)
      const method = parts[0]
      const url = parts[1]
      const statusCode = parseInt(parts[2])
      const responseTime = parseInt(parts[4])

      const parsedLog = {
        method,
        url,
        statusCode,
        responseTime,
        cache: undefined,
      }
      parsedLogs.push(parsedLog)
    }
    return parsedLogs
  }, [] as any[])
}

createNextDescribe(
  'app-dir - logging',
  {
    skipDeployment: true,
    files: __dirname,
  },
  ({ next, isNextDev }) => {
    function runTests({
      withFetchesLogging,
      withFullUrlFetches = false,
    }: {
      withFetchesLogging: boolean
      withFullUrlFetches?: boolean
    }) {
      if (withFetchesLogging) {
        it('should only log requests in dev mode', async () => {
          const outputIndex = next.cliOutput.length
          await next.fetch('/default-cache')

          await retry(() => {
            const logs = stripAnsi(next.cliOutput.slice(outputIndex))
            const hasLogs = logs.includes('GET /default-cache 200')

            expect(isNextDev ? hasLogs : !hasLogs).toBe(true)
          })
        })

        if (isNextDev) {
          it("should log 'skip' cache status with a reason when cache: 'no-cache' is used", async () => {
            const outputIndex = next.cliOutput.length
            await next.fetch('/default-cache')

            await retry(() => {
              const logs = parseLogsFromCli(next.cliOutput.slice(outputIndex))

              const logEntry = logs.find((log) =>
                log.url.includes('api/random?no-cache')
              )

              expect(logs.some((log) => log.url.includes('..'))).toBe(
                !withFullUrlFetches
              )

              expect(logEntry?.cache).toBe('cache: no-cache')
            })
          })

          it("should log 'skip' cache status with a reason when revalidate: 0 is used", async () => {
            const outputIndex = next.cliOutput.length
            await next.fetch('/default-cache')
            await retry(() => {
              const logs = parseLogsFromCli(next.cliOutput.slice(outputIndex))

              const logEntry = logs.find((log) =>
                log.url.includes('api/random?revalidate-0')
              )

              expect(logEntry?.cache).toBe('revalidate: 0')
            })
          })

          it("should log 'skip' cache status with a reason when the browser indicates caching should be ignored", async () => {
            const outputIndex = next.cliOutput.length
            await next.fetch('/default-cache', {
              headers: { 'Cache-Control': 'no-cache' },
            })
            await retry(() => {
              const logs = parseLogsFromCli(next.cliOutput.slice(outputIndex))

              const logEntry = logs.find((log) =>
                log.url.includes('api/random?auto-cache')
              )

              expect(logEntry?.cache).toBe(
                'cache-control: no-cache (hard refresh)'
              )
            })
          })

          it('should log requests with correct indentation', async () => {
            const outputIndex = next.cliOutput.length
            await next.fetch('/default-cache')

            await retry(() => {
              const logs = stripAnsi(next.cliOutput.slice(outputIndex))
              const hasLogs =
                logs.includes(' GET /default-cache') &&
                logs.includes('  │ GET ') &&
                logs.includes('  │  │ GET ') &&
                logs.includes('  │  │  Cache missed reason')

              expect(hasLogs).toBe(true)
            })
          })

          it('should show cache reason of noStore when use with fetch', async () => {
            const logLength = next.cliOutput.length
            await next.fetch('/no-store')

            await retry(() => {
              const output = stripAnsi(next.cliOutput.slice(logLength))
              expect(output).toContain('Cache missed reason: (noStore call)')
            })
          })

          it('should respect request.init.cache when use with fetch input is instance', async () => {
            const logLength = next.cliOutput.length
            await next.fetch('/fetch-no-store')

            await retry(() => {
              const output = stripAnsi(next.cliOutput.slice(logLength))
              expect(output).toContain('Cache missed reason: (cache: no-store)')
            })
          })
        }
      } else {
        // No fetches logging enabled
        it('should not log fetch requests at all', async () => {
          const outputIndex = next.cliOutput.length
          await next.fetch('/default-cache')

          await retry(() => {
            const logs = stripAnsi(next.cliOutput.slice(outputIndex))
            expect(logs).not.toContain('GET /default-cache 200')
          })
        })
      }

      if (isNextDev) {
        it('should not contain trailing word page for app router routes', async () => {
          const logLength = next.cliOutput.length
          await next.fetch('/')

          await retry(() => {
            const output = stripAnsi(next.cliOutput.slice(logLength))
            expect(output).toContain('/')
            expect(output).not.toContain('/page')
          })
        })

        it('should not contain metadata internal segments for dynamic metadata routes', async () => {
          const logLength = next.cliOutput.length
          await next.fetch('/dynamic/big/icon')

          await retry(() => {
            const output = stripAnsi(next.cliOutput.slice(logLength))
            expect(output).toContain('/dynamic/[slug]/icon')
            expect(output).not.toContain('/(group)')
            expect(output).not.toContain('[[...__metadata_id__]]')
            expect(output).not.toContain('/route')
          })
        })
      }
    }

    describe('with fetches verbose logging', () => {
      runTests({ withFetchesLogging: true, withFullUrlFetches: true })
    })

    describe('with fetches default logging', () => {
      const curNextConfig = fs.readFileSync(
        path.join(__dirname, 'next.config.js'),
        { encoding: 'utf-8' }
      )
      beforeAll(async () => {
        await next.stop()
        await next.patchFile(
          'next.config.js',
          curNextConfig.replace('fullUrl: true', 'fullUrl: false')
        )
        await next.start()
      })
      afterAll(async () => {
        await next.patchFile('next.config.js', curNextConfig)
      })

      runTests({ withFetchesLogging: true, withFullUrlFetches: false })
    })

    describe('with verbose logging for edge runtime', () => {
      beforeAll(async () => {
        await next.stop()
        const layoutContent = await next.readFile('app/layout.js')
        await next.patchFile(
          'app/layout.js',
          layoutContent + `\nexport const runtime = 'edge'`
        )
        await next.start()
      })

      runTests({ withFetchesLogging: false })
    })

    describe('with default logging', () => {
      const curNextConfig = fs.readFileSync(
        path.join(__dirname, 'next.config.js'),
        { encoding: 'utf-8' }
      )
      beforeAll(async () => {
        await next.stop()
        await next.deleteFile('next.config.js')
        await next.start()
      })
      afterAll(async () => {
        await next.patchFile('next.config.js', curNextConfig)
      })

      runTests({ withFetchesLogging: false })
    })
  }
)
