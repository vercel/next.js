import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { retry, debugPrint, getFullUrl } from 'next-test-utils'
import stripAnsi from 'strip-ansi'
import { chromium, firefox, webkit } from 'playwright'
import type { Browser } from 'playwright'

describe('mcp-server get_errors tool', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
  })

  async function callGetErrors(id: string) {
    const response = await fetch(`${next.url}/_next/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: 'get_errors', arguments: {} },
      }),
    })

    const text = await response.text()
    const match = text.match(/data: ({.*})/s)
    const result = JSON.parse(match![1])
    return result.result?.content?.[0]?.text
  }

  it('should handle no browser sessions gracefully', async () => {
    const errorsText = await callGetErrors('test-no-session')
    const errors = JSON.parse(errorsText)
    expect(errors).toMatchInlineSnapshot(`
      {
        "error": "No browser sessions connected. Please open your application in a browser to retrieve error state.",
      }
    `)
  })

  it('should return no errors for clean page', async () => {
    await next.browser('/')
    const errorsText = await callGetErrors('test-1')
    const errors = JSON.parse(errorsText)
    expect(errors).toMatchInlineSnapshot(`
      {
        "configErrors": [],
        "sessionErrors": [],
      }
    `)
  })

  it('should capture runtime errors with source-mapped stack frames', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/runtime-error"]').click()

    let errors: any = null
    await retry(async () => {
      const sessionId = 'test-2-' + Date.now()
      const errorsText = await callGetErrors(sessionId)
      errors = JSON.parse(errorsText)
      expect(errors.sessionErrors).toHaveLength(1)
      expect(errors.sessionErrors[0].runtimeErrors).toHaveLength(1)
    })

    expect(errors.sessionErrors[0]).toMatchObject({
      url: '/runtime-error',
      buildError: null,
      runtimeErrors: [
        {
          type: 'runtime',
          errorName: 'Error',
          message: 'Test runtime error',
          stack: expect.arrayContaining([
            expect.objectContaining({
              file: expect.stringContaining('app/runtime-error/page.tsx'),
              methodName: 'RuntimeErrorPage',
            }),
          ]),
        },
      ],
    })
  })

  it('should capture build errors when directly visiting error page', async () => {
    await next.browser('/build-error')

    let errors: any = null
    await retry(async () => {
      const sessionId = 'test-4-' + Date.now()
      const errorsText = await callGetErrors(sessionId)
      errors = JSON.parse(errorsText)
      expect(errors.sessionErrors).toHaveLength(1)
      expect(errors.sessionErrors[0].buildError).toBeTruthy()
    })

    expect(errors.sessionErrors[0]).toMatchObject({
      url: '/build-error',
      buildError: expect.any(String),
    })

    // Check the build error contains the expected syntax error message
    expect(stripAnsi(errors.sessionErrors[0].buildError)).toContain(
      'Unexpected token. Did you mean'
    )
    expect(stripAnsi(errors.sessionErrors[0].buildError)).toContain(
      'build-error/page.tsx'
    )
  })

  it('should capture errors from multiple browser sessions', async () => {
    // Restart the server
    await next.stop()
    await next.start()

    // Open two independent browser sessions concurrently
    const [s1, s2] = await Promise.all([
      launchStandaloneSession(next.url, '/runtime-error'),
      launchStandaloneSession(next.url, '/runtime-error-2'),
    ])

    try {
      // Wait for server to be ready
      await new Promise((resolve) => setTimeout(resolve, 1000))
      let errors: any = null
      await retry(async () => {
        const sessionId = 'test-multi-' + Date.now()
        const errorsText = await callGetErrors(sessionId)
        errors = JSON.parse(errorsText)
        // Check that we have at least the 2 sessions we created
        expect(errors.sessionErrors.length).toBeGreaterThanOrEqual(2)
        // Ensure both our sessions are present
        const urls = errors.sessionErrors.map((s: any) => s.url)
        expect(urls).toContain('/runtime-error')
        expect(urls).toContain('/runtime-error-2')
      })

      // Find each session's errors
      const session1 = errors.sessionErrors.find(
        (s: any) => s.url === '/runtime-error'
      )
      const session2 = errors.sessionErrors.find(
        (s: any) => s.url === '/runtime-error-2'
      )

      expect(session1).toMatchObject({
        url: '/runtime-error',
        runtimeErrors: [
          {
            type: 'runtime',
            message: 'Test runtime error',
            stack: expect.arrayContaining([
              expect.objectContaining({
                file: expect.stringContaining('app/runtime-error/page.tsx'),
                methodName: 'RuntimeErrorPage',
              }),
            ]),
          },
        ],
      })

      expect(session2).toMatchObject({
        url: '/runtime-error-2',
        runtimeErrors: [
          {
            type: 'runtime',
            message: 'Test runtime error 2',
            stack: expect.arrayContaining([
              expect.objectContaining({
                file: expect.stringContaining('app/runtime-error-2/page.tsx'),
                methodName: 'RuntimeErrorPage',
              }),
            ]),
          },
        ],
      })
    } finally {
      await s1.close()
      await s2.close()
    }
  })

  it('should capture next.config errors and clear when fixed', async () => {
    // Read the original config
    const originalConfig = await next.readFile('next.config.js')

    // Stop server, write invalid config, and restart
    await next.stop()
    await next.patchFile(
      'next.config.js',
      `module.exports = {
  experimental: {
    invalidTestProperty: 'this should cause a validation warning',
  },
}`
    )
    await next.start()

    // Open a browser session
    await next.browser('/')

    // Check that the config error is captured
    let errors: any = null
    await retry(async () => {
      const sessionId = 'test-config-error-' + Date.now()
      const errorsText = await callGetErrors(sessionId)
      errors = JSON.parse(errorsText)
      expect(errors.configErrors.length).toBeGreaterThan(0)
    })

    expect(errors.configErrors[0]).toMatchObject({
      message: expect.stringContaining(
        'Invalid next.config.js options detected'
      ),
    })
    expect(errors.configErrors[0].message).toContain('invalidTestProperty')

    // Stop server, fix the config, and restart
    await next.stop()
    await next.patchFile('next.config.js', originalConfig)
    await next.start()

    // Open a browser session
    await next.browser('/')

    // Verify the config error is now gone
    await retry(async () => {
      const sessionId = 'test-config-fixed-' + Date.now()
      const fixedErrorsText = await callGetErrors(sessionId)
      const fixedErrors = JSON.parse(fixedErrorsText)
      expect(fixedErrors.configErrors).toHaveLength(0)
      expect(fixedErrors.sessionErrors).toHaveLength(0)
    })
  })
})

/**
 * Minimal standalone browser session launcher for testing multiple concurrent browser tabs.
 * The standard test harness (next.browser) uses a singleton browser instance which doesn't
 * support concurrent tabs needed for testing errors across multiple browser sessions.
 */
async function launchStandaloneSession(
  appPortOrUrl: string | number,
  url: string
) {
  const headless = !!process.env.HEADLESS
  const browserName = (process.env.BROWSER_NAME || 'chrome').toLowerCase()

  let browser: Browser
  if (browserName === 'safari') {
    browser = await webkit.launch({ headless })
  } else if (browserName === 'firefox') {
    browser = await firefox.launch({ headless })
  } else {
    browser = await chromium.launch({ headless })
  }

  const context = await browser.newContext()
  const page = await context.newPage()

  const fullUrl = getFullUrl(appPortOrUrl, url)
  debugPrint(`Loading standalone browser with ${fullUrl}`)

  page.on('pageerror', (error) => debugPrint('Standalone page error', error))

  await page.goto(fullUrl, { waitUntil: 'load' })
  debugPrint(`Loaded standalone browser with ${fullUrl}`)

  return {
    page,
    close: async () => {
      await page.close().catch(() => {})
      await context.close().catch(() => {})
      await browser.close().catch(() => {})
    },
  }
}
