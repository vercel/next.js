import fs from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('log-file', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  function getLogFilePath(): string {
    const logFilePath = path.join(
      next.testDir,
      next.distDir,
      'logs',
      'next-development.log'
    )
    return logFilePath
  }

  function hasLogFile(): boolean {
    const logPath = getLogFilePath()

    return fs.existsSync(logPath)
  }

  function readLogFile(): string {
    const logPath = getLogFilePath()
    if (fs.existsSync(logPath)) {
      return fs.readFileSync(logPath, 'utf8')
    }
    return ''
  }

  let previousLogContent = ''

  function normalizeLogContent(content: string): string {
    return (
      content
        // Strip lines containing "Download the React DevTools"
        .split('\n')
        .filter((line) => {
          if (!line.trim()) return false
          // Parse JSON and filter out the noise logs
          try {
            const log = JSON.parse(line)
            if (
              /Download the React DevTools|connected to ws at|received ws message|Next.js page already hydrated|Next.js hydrate callback fired|Compiling|Compiled|Ready in/.test(
                log.message
              )
            ) {
              return false
            }
            return true
          } catch {
            return false
          }
        })
        .map((line) => {
          // Normalize timestamps in JSON to consistent format
          try {
            const log = JSON.parse(line)
            log.timestamp = 'xx:xx:xx.xxx'
            return JSON.stringify(log)
          } catch {
            return line
          }
        })
        .join('\n')
    )
  }

  function getNewLogContent(): string {
    const currentContent = readLogFile()
    const newContent = currentContent.slice(previousLogContent.length)
    return normalizeLogContent(newContent)
  }

  beforeEach(async () => {
    await next.fetch('/404')
    // Reset log tracking at the start of each test to only capture new logs
    previousLogContent = readLogFile()
  })

  it('should capture RSC logging in log file', async () => {
    // Request to RSC page and wait for hydration
    await next.browser('/server')
    // Wait for logs to be written (increased timeout for batched logging)
    await new Promise((resolve) => setTimeout(resolve, 2000))

    if (isNextDev) {
      await retry(async () => {
        const newLogContent = getNewLogContent()
        // The server logs will be replayed in the browser, but they'll not be forwarded to terminal,
        // as terminal already has them in the first place.
        expect(newLogContent).toMatchInlineSnapshot(`
         "{"timestamp":"xx:xx:xx.xxx","source":"Server","level":"LOG","message":"RSC: This is a log message from server component"}
         {"timestamp":"xx:xx:xx.xxx","source":"Server","level":"ERROR","message":"RSC: This is an error message from server component"}
         {"timestamp":"xx:xx:xx.xxx","source":"Server","level":"WARN","message":"RSC: This is a warning message from server component"}"
        `)
      })
    } else {
      expect(hasLogFile()).toBe(false)
    }
  })

  it('should capture client logging in log file', async () => {
    // Make request to client page and wait for hydration
    const browser = await next.browser('/client')
    // Wait for console.log to be logged in browser
    await retry(async () => {
      const logs = await browser.log()
      expect(logs).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('Client: Complex circular object'),
          source: 'log',
        })
      )
      expect(logs).toContainEqual(
        expect.objectContaining({
          message: 'Client: This is an error message from client component',
          source: 'error',
        })
      )
    })
    // Wait for logs to be written (reduced timeout with faster flush)
    await new Promise((resolve) => setTimeout(resolve, 2000))

    if (isNextDev) {
      await retry(async () => {
        const newLogContent = getNewLogContent()
        // Only browser only logs are being forwarded to terminal
        expect(newLogContent).toMatchInlineSnapshot(`
         "{"timestamp":"xx:xx:xx.xxx","source":"Browser","level":"LOG","message":"Client: Complex circular object: {\\"data\\":{\\"nested\\":{\\"items\\":[1,2,3],\\"value\\":42},\\"parent\\":\\"[Circular]\\"},\\"metadata\\":{\\"name\\":\\"safe stringify\\",\\"version\\":\\"1.0.0\\"},\\"name\\":\\"test\\"}"}
         {"timestamp":"xx:xx:xx.xxx","source":"Browser","level":"ERROR","message":"Client: This is an error message from client component"}
         {"timestamp":"xx:xx:xx.xxx","source":"Browser","level":"WARN","message":"Client: This is a warning message from client component"}
         {"timestamp":"xx:xx:xx.xxx","source":"Server","level":"ERROR","message":"[browser] \\"Client: This is an error message from client component\\" \\"\\\\n    at ClientPage.useEffect (app/client/page.tsx:25:13)\\\\n  23 |     circularObj.data.parent = circularObj\\\\n  24 |     console.log('Client: Complex circular object:', circularObj)\\\\n> 25 |     console.error('Client: This is an error message from client component')\\\\n     |             ^\\\\n  26 |     console.warn('Client: This is a warning message from client component')\\\\n  27 |   }, [])\\\\n  28 |\\" \\"(app/client/page.tsx:25:13)\\""}
         {"timestamp":"xx:xx:xx.xxx","source":"Browser","level":"ERROR","message":"Client: This is an error message from client component \\"\\\\n    at ClientPage.useEffect (app/client/page.tsx:25:13)\\\\n  23 |     circularObj.data.parent = circularObj\\\\n  24 |     console.log('Client: Complex circular object:', circularObj)\\\\n> 25 |     console.error('Client: This is an error message from client component')\\\\n     |             ^\\\\n  26 |     console.warn('Client: This is a warning message from client component')\\\\n  27 |   }, [])\\\\n  28 |\\" \\"(app/client/page.tsx:25:13)\\""}
         {"timestamp":"xx:xx:xx.xxx","source":"Server","level":"WARN","message":"[browser] \\"Client: This is a warning message from client component\\" \\"(app/client/page.tsx:26:13)\\""}
         {"timestamp":"xx:xx:xx.xxx","source":"Browser","level":"WARN","message":"Client: This is a warning message from client component"}"
        `)
      })
    } else {
      expect(hasLogFile()).toBe(false)
    }
  })

  it('should capture logging in pages router', async () => {
    // Make request to page with getServerSideProps
    await next.browser('/pages-router-page')
    // Wait for logs to be written (increased timeout for batched logging)
    await new Promise((resolve) => setTimeout(resolve, 2000))

    if (isNextDev) {
      await retry(async () => {
        const newLogContent = getNewLogContent()
        expect(newLogContent).toMatchInlineSnapshot(`
         "{"timestamp":"xx:xx:xx.xxx","source":"Server","level":"LOG","message":"Pages Router SSR: This is a log message from getServerSideProps"}
         {"timestamp":"xx:xx:xx.xxx","source":"Server","level":"ERROR","message":"Pages Router SSR: This is an error message from getServerSideProps"}
         {"timestamp":"xx:xx:xx.xxx","source":"Server","level":"WARN","message":"Pages Router SSR: This is a warning message from getServerSideProps"}
         {"timestamp":"xx:xx:xx.xxx","source":"Server","level":"LOG","message":"Pages Router isomorphic: This is a log message from render"}
         {"timestamp":"xx:xx:xx.xxx","source":"Browser","level":"LOG","message":"Pages Router isomorphic: This is a log message from render"}"
        `)
      })
    } else {
      expect(hasLogFile()).toBe(false)
    }
  })
})
