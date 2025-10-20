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
    const errors = await callGetErrors('test-no-session')
    expect(stripAnsi(errors)).toMatchInlineSnapshot(
      `"No browser sessions connected. Please open your application in a browser to retrieve error state."`
    )
  })

  it('should return no errors for clean page', async () => {
    await next.browser('/')
    const errors = await callGetErrors('test-1')
    expect(stripAnsi(errors)).toMatchInlineSnapshot(
      `"No errors detected in 1 browser session(s)."`
    )
  })

  it('should capture runtime errors with source-mapped stack frames', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/runtime-error"]').click()

    let errors: string = ''
    await retry(async () => {
      const sessionId = 'test-2-' + Date.now()
      errors = await callGetErrors(sessionId)
      expect(errors).toContain('Runtime Errors')
      expect(errors).toContain('Found errors in 1 browser session')
    })

    const strippedErrors = stripAnsi(errors)
      // Replace dynamic port with placeholder
      .replace(/localhost:\d+/g, 'localhost:PORT')

    // Verify proper URL display in session header (now shows pathname only)
    expect(strippedErrors).toContain('Session: /runtime-error')

    expect(strippedErrors).toMatchInlineSnapshot(`
      "# Found errors in 1 browser session(s)

      ## Session: /runtime-error

      **1 error(s) found**

      ### Runtime Errors

      #### Error 1 (Type: runtime)

      **Error**: Test runtime error

      \`\`\`
        at RuntimeErrorPage (app/runtime-error/page.tsx:2:9)
      \`\`\`

      ---"
    `)
  })

  it('should capture build errors when directly visiting error page', async () => {
    await next.browser('/build-error')

    let errors: string = ''
    await retry(async () => {
      const sessionId = 'test-4-' + Date.now()
      errors = await callGetErrors(sessionId)
      expect(errors).toContain('Build Error')
      expect(errors).toContain('Found errors in 1 browser session')
    })

    let strippedErrors = stripAnsi(errors)
      // Replace dynamic port with placeholder
      .replace(/localhost:\d+/g, 'localhost:PORT')

    // Verify proper URL display in session header (now shows pathname only)
    expect(strippedErrors).toContain('Session: /build-error')

    const isTurbopack = process.env.IS_TURBOPACK_TEST === '1'

    const isRspack = !!process.env.NEXT_RSPACK

    // Normalize paths in turbopack output to remove temp directory prefix
    if (isTurbopack) {
      strippedErrors = strippedErrors.replace(/\.\/test\/tmp\/[^/]+\//g, './')
    }

    if (isTurbopack) {
      // Turbopack output
      expect(strippedErrors).toMatchInlineSnapshot(`
       "# Found errors in 1 browser session(s)

       ## Session: /build-error

       **2 error(s) found**

       ### Build Error

       \`\`\`
       ./app/build-error/page.tsx:4:1
       Parsing ecmascript source code failed
         2 |   // Syntax error - missing closing brace
         3 |   return <div>Page
       > 4 | }
           | ^

       Unexpected token. Did you mean \`{'}'}\` or \`&rbrace;\`?
       \`\`\`

       ### Runtime Errors

       #### Error 1 (Type: runtime)

       **Error**: ./app/build-error/page.tsx:4:1
       Parsing ecmascript source code failed
         2 |   // Syntax error - missing closing brace
         3 |   return <div>Page
       > 4 | }
           | ^

       Unexpected token. Did you mean \`{'}'}\` or \`&rbrace;\`?



       \`\`\`
         at <unknown> (Error: ./app/build-error/page.tsx:4:1)
         at <unknown> (Error: (./app/build-error/page.tsx:4:1)
       \`\`\`

       ---"
      `)
    } else if (isRspack) {
      // Webpack output
      expect(strippedErrors).toMatchInlineSnapshot(`
       "# Found errors in 1 browser session(s)

       ## Session: /build-error

       **1 error(s) found**

       ### Build Error

       \`\`\`
       ./app/build-error/page.tsx
         × Module build failed:
         ╰─▶   × Error:   x Unexpected token. Did you mean \`{'}'}\` or \`&rbrace;\`?
               │    ,-[4:1]
               │  1 | export default function BuildErrorPage() {
               │  2 |   // Syntax error - missing closing brace
               │  3 |   return <div>Page
               │  4 | }
               │    : ^
               │    \`----
               │   x Expected '</', got '<eof>'
               │    ,-[4:1]
               │  1 | export default function BuildErrorPage() {
               │  2 |   // Syntax error - missing closing brace
               │  3 |   return <div>Page
               │  4 | }
               │    \`----
               │
               │
               │ Caused by:
               │     Syntax Error
       \`\`\`

       ---"
      `)
    } else {
      expect(strippedErrors).toMatchInlineSnapshot(`
       "# Found errors in 1 browser session(s)

       ## Session: /build-error

       **1 error(s) found**

       ### Build Error

       \`\`\`
       ./app/build-error/page.tsx
       Error:   x Unexpected token. Did you mean \`{'}'}\` or \`&rbrace;\`?
          ,-[4:1]
        1 | export default function BuildErrorPage() {
        2 |   // Syntax error - missing closing brace
        3 |   return <div>Page
        4 | }
          : ^
          \`----
         x Expected '</', got '<eof>'
          ,-[4:1]
        1 | export default function BuildErrorPage() {
        2 |   // Syntax error - missing closing brace
        3 |   return <div>Page
        4 | }
          \`----

       Caused by:
           Syntax Error
       \`\`\`

       ---"
      `)
    }
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
      let errors: string = ''
      await retry(async () => {
        const sessionId = 'test-multi-' + Date.now()
        errors = await callGetErrors(sessionId)
        // Check that we have at least the 2 sessions we created
        expect(errors).toMatch(/Found errors in \d+ browser session/)
        // Ensure both our sessions are present
        expect(errors).toContain('/runtime-error')
        expect(errors).toContain('/runtime-error-2')
      })

      const strippedErrors = stripAnsi(errors).replace(
        /localhost:\d+/g,
        'localhost:PORT'
      )

      // Extract each session's content to check them independently
      const session1Match = strippedErrors.match(
        /## Session: \/runtime-error\n[\s\S]*?(?=---)/
      )
      const session2Match = strippedErrors.match(
        /## Session: \/runtime-error-2\n[\s\S]*?(?=---)/
      )

      expect(session1Match).toBeTruthy()
      expect(session2Match).toBeTruthy()

      expect(session1Match?.[0]).toMatchInlineSnapshot(`
        "## Session: /runtime-error

        **1 error(s) found**

        ### Runtime Errors

        #### Error 1 (Type: runtime)

        **Error**: Test runtime error

        \`\`\`
          at RuntimeErrorPage (app/runtime-error/page.tsx:2:9)
        \`\`\`

        "
      `)

      expect(session2Match?.[0]).toMatchInlineSnapshot(`
        "## Session: /runtime-error-2

        **1 error(s) found**

        ### Runtime Errors

        #### Error 1 (Type: runtime)

        **Error**: Test runtime error 2

        \`\`\`
          at RuntimeErrorPage (app/runtime-error-2/page.tsx:2:9)
        \`\`\`

        "
      `)
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
    let errors: string = ''
    await retry(async () => {
      const sessionId = 'test-config-error-' + Date.now()
      errors = await callGetErrors(sessionId)
      expect(errors).toContain('Next.js Configuration Errors')
      expect(errors).toContain('error(s) found in next.config')
    })

    const strippedErrors = stripAnsi(errors)
    expect(strippedErrors).toContain('Next.js Configuration Errors')
    expect(strippedErrors).toContain('Invalid next.config.js options detected')
    expect(strippedErrors).toContain('invalidTestProperty')

    // Stop server, fix the config, and restart
    await next.stop()
    await next.patchFile('next.config.js', originalConfig)
    await next.start()

    // Open a browser session
    await next.browser('/')

    // Verify the config error is now gone
    await retry(async () => {
      const sessionId = 'test-config-fixed-' + Date.now()
      const fixedErrors = await callGetErrors(sessionId)
      const strippedFixed = stripAnsi(fixedErrors)
      expect(strippedFixed).not.toContain('Next.js Configuration Errors')
      expect(strippedFixed).not.toContain('invalidTestProperty')
      expect(strippedFixed).toContain('No errors detected')
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
