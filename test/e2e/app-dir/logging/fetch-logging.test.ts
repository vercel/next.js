import path from 'path'
import fs from 'fs'
import stripAnsi from 'strip-ansi'
import { retry } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'
import { createSandbox } from 'development-sandbox'

const cacheReasonRegex = /Cache (missed|skipped) reason: /

interface ParsedLog {
  method: string
  url: string
  statusCode: number
  responseTime: number
  cache: string
}

function parseLogsFromCli(cliOutput: string) {
  const logs = stripAnsi(cliOutput)
    .split('\n')
    .filter((log) => cacheReasonRegex.test(log) || log.includes('GET'))

  return logs.reduce<ParsedLog[]>((parsedLogs, log) => {
    if (cacheReasonRegex.test(log)) {
      // cache miss/skip reason
      // Example of `log`: "│ │ Cache skipped reason: (cache: no-cache)"
      const reasonSegment = log.split(cacheReasonRegex, 3)[2].trim()
      const reason = reasonSegment.slice(1, -1)
      parsedLogs[parsedLogs.length - 1].cache = reason
    } else {
      // request info
      const trimmedLog = log.replace(/^[^a-zA-Z]+/, '')
      const [method, url, statusCode, responseTime] = trimmedLog.split(' ', 5)

      parsedLogs.push({
        method,
        url,
        statusCode: parseInt(statusCode, 10),
        responseTime: parseInt(responseTime, 10),
        cache: undefined,
      })
    }
    return parsedLogs
  }, [])
}

describe('app-dir - fetch logging', () => {
  const { next, isNextDev } = nextTestSetup({
    skipDeployment: true,
    files: __dirname,
  })

  isNextDev &&
    it('should not log requests for HMR refreshes', async () => {
      await using sandbox = await createSandbox(
        next,
        undefined,
        '/fetch-no-store'
      )

      const { browser, session } = sandbox

      let headline = await browser.waitForElementByCss('h1').text()
      expect(headline).toBe('Hello World!')
      const outputIndex = next.cliOutput.length

      await session.patch('app/fetch-no-store/page.js', (content) =>
        content.replace('Hello World!', 'Hello Test!')
      )

      await retry(async () => {
        headline = await browser.waitForElementByCss('h1').text()
        expect(headline).toBe('Hello Test!')
        const logs = stripAnsi(next.cliOutput.slice(outputIndex))
        expect(logs).toInclude(' GET /fetch-no-store')
        expect(logs).not.toInclude(` │ GET `)
        // TODO: remove custom duration in case we increase the default.
      }, 5000)
    })

  // TODO: remove when there is a test for isNextDev === false
  it('placeholder to satisfy at least one test when isNextDev is false', async () => {
    expect(true).toBe(true)
  })
})

describe('app-dir - logging', () => {
  const { next, isNextDev } = nextTestSetup({
    skipDeployment: true,
    files: __dirname,
  })
  function runTests({
    withFetchesLogging,
    withFullUrlFetches = false,
  }: {
    withFetchesLogging: boolean
    withFullUrlFetches?: boolean
  }) {
    if (withFetchesLogging) {
      it('should only log requests in development mode', async () => {
        const outputIndex = next.cliOutput.length
        await next.fetch('/default-cache')

        await retry(() => {
          const logs = stripAnsi(next.cliOutput.slice(outputIndex))
          if (isNextDev) {
            expect(logs).toContain('GET /default-cache 200')
          } else {
            expect(logs).not.toContain('GET /default-cache 200')
          }
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

          const expectedUrl = withFullUrlFetches
            ? 'https://next-data-api-endpoint.vercel.app/api/random'
            : 'https://next-data-api-en../api/random'

          await retry(() => {
            const logs = stripAnsi(next.cliOutput.slice(outputIndex))
            expect(logs).toIncludeRepeated(' GET /default-cache', 1)
            expect(logs).toIncludeRepeated(` │ GET ${expectedUrl}`, 7)
            expect(logs).toIncludeRepeated(' │ │ Cache skipped reason', 3)
          })
        })

        it('should not limit the number of requests that are logged', async () => {
          const outputIndex = next.cliOutput.length
          await next.fetch('/many-requests')

          const expectedUrl = withFullUrlFetches
            ? 'https://next-data-api-endpoint.vercel.app/api/random'
            : 'https://next-data-api-en../api/random'

          await retry(() => {
            const logs = stripAnsi(next.cliOutput.slice(outputIndex))
            expect(logs).toIncludeRepeated(` │ GET ${expectedUrl}`, 6)
            expect(logs).toIncludeRepeated(` │ POST ${expectedUrl}`, 6)
          })
        })

        it('should show cache reason of noStore when use with fetch', async () => {
          const logLength = next.cliOutput.length
          await next.fetch('/no-store')

          await retry(() => {
            const output = stripAnsi(next.cliOutput.slice(logLength))
            expect(output).toContain('Cache skipped reason: (noStore call)')
          })
        })

        it('should respect request.init.cache when use with fetch input is instance', async () => {
          const logLength = next.cliOutput.length
          await next.fetch('/fetch-no-store')

          await retry(() => {
            const output = stripAnsi(next.cliOutput.slice(logLength))
            expect(output).toContain('Cache skipped reason: (cache: no-store)')
          })
        })

        it('should log each page request only once', async () => {
          const outputIndex = next.cliOutput.length
          await next.fetch('/')
          await retry(() => {
            const logsAfterRequest = stripAnsi(
              next.cliOutput.slice(outputIndex)
            )
            // Only show `GET /` once
            expect(logsAfterRequest.split('GET /').length).toBe(2)
          })
        })

        it('should exclude Middleware invoked and _rsc requests', async () => {
          const outputIndex = next.cliOutput.length

          const browser = await next.browser('/link')
          await browser.elementByCss('a#foo').click()
          await browser.waitForElementByCss('h2')
          const logs = stripAnsi(next.cliOutput.slice(outputIndex))
          expect(logs).not.toContain('/_next/static')
          expect(logs).not.toContain('?_rsc')
        })

        it('should not log _rsc query for client navigation RSC request', async () => {
          const outputIndex = next.cliOutput.length

          const browser = await next.browser('/')
          await browser.elementByCss('a#nav-headers').click()
          await browser.waitForElementByCss('p')
          const logs = stripAnsi(next.cliOutput.slice(outputIndex))

          expect(logs).toContain('GET /')
          expect(logs).toContain('GET /headers')
          expect(logs).not.toContain('/_next/static')
          expect(logs).not.toContain('?_rsc')
        })

        it('should log requests for client-side navigations', async () => {
          const outputIndex = next.cliOutput.length
          const browser = await next.browser('/')
          await browser.elementById('nav-default-cache').click()
          await browser.waitForElementByCss('h1')

          const expectedUrl = withFullUrlFetches
            ? 'https://next-data-api-endpoint.vercel.app/api/random'
            : 'https://next-data-api-en../api/random'

          await retry(() => {
            const logs = stripAnsi(next.cliOutput.slice(outputIndex))
            expect(logs).toIncludeRepeated(` │ GET ${expectedUrl}`, 7)
          })
        })

        it('should log requests for after revalidation via server action', async () => {
          let outputIndex = next.cliOutput.length
          const browser = await next.browser('/default-cache')

          const expectedUrl = withFullUrlFetches
            ? 'https://next-data-api-endpoint.vercel.app/api/random'
            : 'https://next-data-api-en../api/random'

          await retry(() => {
            const logs = stripAnsi(next.cliOutput.slice(outputIndex))
            expect(logs).toIncludeRepeated(` │ GET ${expectedUrl}`, 7)
          })

          outputIndex = next.cliOutput.length

          await browser.elementById('revalidate-button').click()

          await retry(() => {
            const logs = stripAnsi(next.cliOutput.slice(outputIndex))
            expect(logs).toIncludeRepeated(` │ GET ${expectedUrl}`, 7)
          })
        })

        describe('when logging.fetches.hmrRefreshes is true', () => {
          beforeAll(async () => {
            await next.patchFile('next.config.js', (content) =>
              content.replace('// hmrRefreshes: true', 'hmrRefreshes: true')
            )
          })

          afterAll(async () => {
            await next.patchFile('next.config.js', (content) =>
              content.replace('hmrRefreshes: true', '// hmrRefreshes: true')
            )
          })

          it('should log requests for HMR refreshes', async () => {
            const browser = await next.browser('/fetch-no-store')
            let headline = await browser.waitForElementByCss('h1').text()
            expect(headline).toBe('Hello World!')
            const outputIndex = next.cliOutput.length

            await next.patchFile(
              'app/fetch-no-store/page.js',
              (content) => content.replace('Hello World!', 'Hello Test!'),
              async () => {
                const expectedUrl = withFullUrlFetches
                  ? 'https://next-data-api-endpoint.vercel.app/api/random'
                  : 'https://next-data-api-en../api/random'

                return retry(async () => {
                  headline = await browser.waitForElementByCss('h1').text()
                  expect(headline).toBe('Hello Test!')

                  const logs = stripAnsi(
                    next.cliOutput.slice(outputIndex)
                  ).replace(/\d+ms/g, '1ms')

                  expect(logs).toInclude(' GET /fetch-no-store')
                  expect(logs).toInclude(
                    ` │ GET ${expectedUrl}?request-input 200 in 1ms (HMR cache)`
                  )
                  // TODO: remove custom duration in case we increase the default.
                }, 5000)
              }
            )
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
          expect(output).toContain('/dynamic/big/icon')
          expect(output).not.toContain('/(group)')
          expect(output).not.toContain('[__metadata_id__]')
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

    runTests({ withFetchesLogging: true, withFullUrlFetches: true })
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
})
