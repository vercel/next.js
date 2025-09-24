import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

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
      `"No errors detected in the browser."`
    )
  })

  it('should capture runtime errors with source-mapped stack frames', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/runtime-error"]').click()

    let errors: string = ''
    await retry(async () => {
      const sessionId = 'test-2-' + Date.now()
      errors = await callGetErrors(sessionId)
      expect(errors).toContain('=== RUNTIME ERRORS ===')
    })

    expect(stripAnsi(errors)).toMatchInlineSnapshot(`
     "Found 1 error(s) in the browser:

     === RUNTIME ERRORS ===

     [Error 1] (Type: runtime)
     Error: Test runtime error
       at RuntimeErrorPage (app/runtime-error/page.tsx:2:9)"
    `)
  })

  it('should capture build errors when directly visiting error page', async () => {
    await next.browser('/build-error')

    let errors: string = ''
    await retry(async () => {
      const sessionId = 'test-4-' + Date.now()
      errors = await callGetErrors(sessionId)
      expect(errors).toContain('=== BUILD ERROR ===')
    })

    let strippedErrors = stripAnsi(errors)
    const isTurbopack = process.env.IS_TURBOPACK_TEST === '1'

    // Normalize paths in turbopack output to remove temp directory prefix
    if (isTurbopack) {
      strippedErrors = strippedErrors.replace(/\.\/test\/tmp\/[^/]+\//g, './')
    }

    if (isTurbopack) {
      // Turbopack output
      expect(strippedErrors).toMatchInlineSnapshot(`
       "Found 2 error(s) in the browser:

       === BUILD ERROR ===
       ./app/build-error/page.tsx:4:1
       Parsing ecmascript source code failed
         2 |   // Syntax error - missing closing brace
         3 |   return <div>Page
       > 4 | }
           | ^

       Unexpected token. Did you mean \`{'}'}\` or \`&rbrace;\`?

       === RUNTIME ERRORS ===

       [Error 1] (Type: runtime)
       Error: ./app/build-error/page.tsx:4:1
       Parsing ecmascript source code failed
         2 |   // Syntax error - missing closing brace
         3 |   return <div>Page
       > 4 | }
           | ^

       Unexpected token. Did you mean \`{'}'}\` or \`&rbrace;\`?


         at <unknown> (Error: ./app/build-error/page.tsx:4:1)
         at <unknown> (Error: (./app/build-error/page.tsx:4:1)"
      `)
    } else {
      // Webpack output
      expect(strippedErrors).toMatchInlineSnapshot(`
       "Found 1 error(s) in the browser:

       === BUILD ERROR ===
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
           Syntax Error"
      `)
    }
  })
})
