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
          // filter out the noise logs
          if (
            /Download the React DevTools|connected to ws at|received ws message|Next.js page already hydrated|Next.js hydrate callback fired|Compiling|Compiled|Ready in/.test(
              line
            )
          ) {
            return false
          }
          return true
        })
        .join('\n')
        // Normalize timestamps to consistent format
        .replace(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/g, '[xx:xx:xx.xxx]')
    )
  }

  function getNewLogContent(): string {
    const currentContent = readLogFile()
    const newContent = currentContent.slice(previousLogContent.length)
    return normalizeLogContent(newContent)
  }

  beforeEach(() => {
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
        expect(newLogContent).toMatchInlineSnapshot(`
         "[xx:xx:xx.xxx] Server  LOG     RSC: This is a log message from server component
         [xx:xx:xx.xxx] Server  ERROR   RSC: This is an error message from server component
         [xx:xx:xx.xxx] Server  WARN    RSC: This is a warning message from server component
         "
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
        expect(newLogContent).toMatchInlineSnapshot(`
         "[xx:xx:xx.xxx] Browser LOG     Client: Complex circular object: {"data":{"nested":{"items":[1,2,3],"value":42},"parent":"[Circular]"},"metadata":{"name":"safe stringify","version":"1.0.0"},"name":"test"}
         [xx:xx:xx.xxx] Browser ERROR   Client: This is an error message from client component
         [xx:xx:xx.xxx] Browser WARN    Client: This is a warning message from client component
         "
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
         "[xx:xx:xx.xxx] Server  LOG     Pages Router SSR: This is a log message from getServerSideProps
         [xx:xx:xx.xxx] Server  ERROR   Pages Router SSR: This is an error message from getServerSideProps
         [xx:xx:xx.xxx] Server  WARN    Pages Router SSR: This is a warning message from getServerSideProps
         [xx:xx:xx.xxx] Server  LOG     Pages Router isomorphic: This is a log message from render
         [xx:xx:xx.xxx] Browser LOG     Pages Router isomorphic: This is a log message from render
         "
        `)
      })
    } else {
      expect(hasLogFile()).toBe(false)
    }
  })
})
