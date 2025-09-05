import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'
import stripAnsi from 'strip-ansi'
import { retry } from 'next-test-utils'

const bundlerName = process.env.IS_TURBOPACK_TEST ? 'Turbopack' : 'Webpack'

function setupLogCapture() {
  const logs: string[] = []
  const originalStdout = process.stdout.write
  const originalStderr = process.stderr.write

  const capture = (chunk: any) => {
    logs.push(stripAnsi(chunk.toString()))
    return true
  }

  process.stdout.write = function (chunk: any) {
    capture(chunk)
    return originalStdout.call(this, chunk)
  }

  process.stderr.write = function (chunk: any) {
    capture(chunk)
    return originalStderr.call(this, chunk)
  }

  const restore = () => {
    process.stdout.write = originalStdout
    process.stderr.write = originalStderr
  }

  const clearLogs = () => {
    logs.length = 0
  }

  return { logs, restore, clearLogs }
}

describe(`Terminal Logging (${bundlerName})`, () => {
  describe('Pages Router', () => {
    let next: NextInstance
    let logs: string[] = []
    let logCapture: ReturnType<typeof setupLogCapture>
    let browser = null

    beforeAll(async () => {
      logCapture = setupLogCapture()
      logs = logCapture.logs

      next = await createNext({
        files: {
          pages: new FileRef(join(__dirname, 'fixtures/pages')),
          'next.config.js': `
            module.exports = {
              experimental: {
                browserDebugInfoInTerminal: true
              }
            }
          `,
        },
      })
    })

    afterAll(async () => {
      logCapture.restore()
      await next.destroy()
    })

    beforeEach(() => {
      logCapture.clearLogs()
    })

    afterEach(async () => {
      if (browser) {
        await browser.close()
        browser = null
      }
    })

    it('should forward client component logs', async () => {
      browser = await webdriver(next.url, '/pages-client-log')
      await browser.waitForElementByCss('#log-button')
      await browser.elementByCss('#log-button').click()

      await retry(() => {
        const logOutput = logs.join('')
        expect(logOutput).toContain(
          '[browser] Log from pages router client component'
        )
      })
    })

    it('should handle circular references safely', async () => {
      browser = await webdriver(next.url, '/circular-refs')
      await browser.waitForElementByCss('#circular-button')
      await browser.elementByCss('#circular-button').click()

      await retry(() => {
        const logOutput = logs.join('\n')
        expect(logOutput).toContain('[browser] Circular object:')
        expect(logOutput).toContain('[Circular]')
      })
    })

    it('should respect default depth limit', async () => {
      browser = await webdriver(next.url, '/deep-objects')
      await browser.waitForElementByCss('#deep-button')
      await browser.elementByCss('#deep-button').click()

      await retry(() => {
        const logOutput = logs.join('\n')
        expect(logOutput).toContain('[browser] Deep object: {')
        expect(logOutput).toContain('level1: {')
        expect(logOutput).toContain('level2: { level3: { level4: { level5:')
        expect(logOutput).toContain("'[Object]'")
      })
    })

    it('should show source-mapped errors in pages router', async () => {
      browser = await webdriver(next.url, '/pages-client-error')
      await browser.waitForElementByCss('#error-button')

      logCapture.clearLogs()

      await browser.elementByCss('#error-button').click()

      await retry(() => {
        const logOutput = logs.join('\n')
        const browserErrorPattern =
          /\[browser\] Uncaught Error: Client error in pages router\n\s+at throwClientError \(pages\/pages-client-error\.js:2:\d+\)\n\s+at callClientError \(pages\/pages-client-error\.js:6:\d+\)/
        expect(logOutput).toMatch(browserErrorPattern)
      })
    })

    it('should show source-mapped errors for server errors from pages router ', async () => {
      const outputIndex = logs.length

      browser = await webdriver(next.url, '/pages-server-error')

      await retry(() => {
        const newLogs = logs.slice(outputIndex).join('\n')

        const browserErrorPattern =
          /\[browser\] Uncaught Error: Server error in pages router\n\s+at throwPagesServerError \(pages\/pages-server-error\.js:2:\d+\)\n\s+at callPagesServerError \(pages\/pages-server-error\.js:6:\d+\)/
        expect(newLogs).toMatch(browserErrorPattern)
      })
    })
  })

  describe('App Router - Server Components', () => {
    let next: NextInstance
    let logs: string[] = []
    let logCapture: ReturnType<typeof setupLogCapture>

    beforeAll(async () => {
      logCapture = setupLogCapture()
      logs = logCapture.logs

      next = await createNext({
        files: {
          app: new FileRef(join(__dirname, 'fixtures/app')),
          'next.config.js': `
            module.exports = {
              experimental: {
                browserDebugInfoInTerminal: true
              }
            }
          `,
        },
      })
    })

    afterAll(async () => {
      logCapture.restore()
      await next.destroy()
    })

    beforeEach(() => {
      logCapture.clearLogs()
    })

    it('should not re-log server component logs', async () => {
      const outputIndex = logs.length
      await next.render('/server-log')

      await retry(() => {
        const newLogs = logs.slice(outputIndex).join('')
        expect(newLogs).toContain('Server component console.log')
      }, 2000)

      const newLogs = logs.slice(outputIndex).join('')

      expect(newLogs).not.toContain('[browser] Server component console.log')
      expect(newLogs).not.toContain('[browser] Server component console.error')
    })

    it('should show source-mapped errors for server components', async () => {
      const outputIndex = logs.length

      const browser = await webdriver(next.url, '/server-error')

      await retry(() => {
        const newLogs = logs.slice(outputIndex).join('\n')

        const browserErrorPattern =
          /\[browser\] Uncaught Error: Server component error in app router\n\s+at throwServerError \(app\/server-error\/page\.js:2:\d+\)\n\s+at callServerError \(app\/server-error\/page\.js:6:\d+\)\n\s+at ServerErrorPage \(app\/server-error\/page\.js:10:\d+\)/
        expect(newLogs).toMatch(browserErrorPattern)
      })

      await browser.close()
    })
  })

  describe('App Router - Client Components', () => {
    let next: NextInstance
    let logs: string[] = []
    let logCapture: ReturnType<typeof setupLogCapture>

    beforeAll(async () => {
      logCapture = setupLogCapture()
      logs = logCapture.logs

      next = await createNext({
        files: {
          app: new FileRef(join(__dirname, 'fixtures/app')),
          'next.config.js': `
            module.exports = {
              experimental: {
                browserDebugInfoInTerminal: true
              }
            }
          `,
        },
      })
    })

    afterAll(async () => {
      logCapture.restore()
      await next.destroy()
    })

    beforeEach(() => {
      logCapture.clearLogs()
    })

    it('should forward client component logs in app router', async () => {
      const browser = await webdriver(next.url, '/client-log')
      await browser.waitForElementByCss('#log-button')
      await browser.elementByCss('#log-button').click()

      await retry(() => {
        const logOutput = logs.join('')
        expect(logOutput).toContain(
          '[browser] Client component log from app router'
        )
      })

      await browser.close()
    })

    it('should show source-mapped errors for client components', async () => {
      const browser = await webdriver(next.url, '/client-error')
      await browser.waitForElementByCss('#error-button')

      logCapture.clearLogs()

      await browser.elementByCss('#error-button').click()

      await retry(() => {
        const logOutput = logs.join('\n')
        const browserErrorPattern =
          /\[browser\] Uncaught Error: Client component error in app router\n\s+at throwError \(app\/client-error\/page\.js:4:\d+\)\n\s+at callError \(app\/client-error\/page\.js:8:\d+\)/
        expect(logOutput).toMatch(browserErrorPattern)
      })

      await browser.close()
    })
  })

  describe('App Router - Edge Runtime', () => {
    let next: NextInstance
    let logs: string[] = []
    let logCapture: ReturnType<typeof setupLogCapture>

    beforeAll(async () => {
      logCapture = setupLogCapture()
      logs = logCapture.logs

      next = await createNext({
        files: {
          app: new FileRef(join(__dirname, 'fixtures/app')),
          'next.config.js': `
            module.exports = {
              experimental: {
                browserDebugInfoInTerminal: true
              }
            }
          `,
        },
      })
    })

    afterAll(async () => {
      logCapture.restore()
      await next.destroy()
    })

    beforeEach(() => {
      logCapture.clearLogs()
    })

    it('should handle edge runtime errors with source mapping', async () => {
      const browser = await webdriver(next.url, '/edge-deep-stack')

      await retry(() => {
        const logOutput = logs.join('\n')

        const browserErrorPattern =
          /\[browser\] Uncaught Error: Deep stack error during render\n\s+at functionA \(app\/edge-deep-stack\/page\.js:6:\d+\)\n\s+at functionB \(app\/edge-deep-stack\/page\.js:10:\d+\)\n\s+at functionC \(app\/edge-deep-stack\/page\.js:14:\d+\)\n\s+at EdgeDeepStackPage \(app\/edge-deep-stack\/page\.js:18:\d+\)/
        expect(logOutput).toMatch(browserErrorPattern)
      })

      await browser.close()
    })
  })

  describe('Configuration Options', () => {
    describe('showSourceLocation disabled', () => {
      let next: NextInstance
      let logs: string[] = []
      let logCapture: ReturnType<typeof setupLogCapture>
      let browser = null

      beforeAll(async () => {
        logCapture = setupLogCapture()
        logs = logCapture.logs

        next = await createNext({
          files: {
            pages: new FileRef(join(__dirname, 'fixtures/pages')),
            'next.config.js': `
              module.exports = {
                experimental: {
                  browserDebugInfoInTerminal: {
                    showSourceLocation: false
                  }
                }
              }
            `,
          },
        })
      })

      afterAll(async () => {
        logCapture.restore()
        await next.destroy()
      })

      beforeEach(() => {
        logCapture.clearLogs()
      })

      afterEach(async () => {
        if (browser) {
          await browser.close()
          browser = null
        }
      })

      it('should omit source location when disabled', async () => {
        browser = await webdriver(next.url, '/basic-logs')

        await browser.waitForElementByCss('#log-button')
        await browser.elementByCss('#log-button').click()

        await retry(() => {
          const logOutput = logs.join('')
          expect(logOutput).toContain('[browser] Hello from browser')
          expect(logOutput).not.toMatch(/\([^)]+basic-logs\.[jt]sx?:\d+:\d+\)/)
        })
      })
    })
  })
})
