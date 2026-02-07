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
          'next.config.js': new FileRef(
            join(__dirname, 'fixtures/next.config.js')
          ),
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
          'next.config.js': new FileRef(
            join(__dirname, 'fixtures/next.config.js')
          ),
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
          'next.config.js': new FileRef(
            join(__dirname, 'fixtures/next.config.js')
          ),
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

  describe('App Router - Hydration Errors', () => {
    let next: NextInstance
    let logs: string[] = []
    let logCapture: ReturnType<typeof setupLogCapture>

    beforeAll(async () => {
      logCapture = setupLogCapture()
      logs = logCapture.logs

      next = await createNext({
        files: {
          app: new FileRef(join(__dirname, 'fixtures/app')),
          'next.config.js': new FileRef(
            join(__dirname, 'fixtures/next.config.js')
          ),
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

    it('should show hydration errors with owner stack trace', async () => {
      const browser = await webdriver(next.url, '/hydration-error')

      let hydrationErrorLog = ''
      await retry(() => {
        const logOutput = logs.join('\n')
        // Find the hydration error log entry
        // Stop at: another [browser] log, status indicators (○ ⨯),
        // or timestamp-prefixed logs (e.g. "[12:34:56.789Z] Browser Log: ...")
        const hydrationMatch = logOutput.match(
          /\[browser\].*Hydration[\s\S]*?(?=\n\[browser\]|\n *○|\n *⨯|\n *\[\d|$)/
        )
        expect(hydrationMatch).not.toBeNull()
        hydrationErrorLog = hydrationMatch![0]
        // Verify the Page component is in the forwarded stack trace with source location
        expect(hydrationErrorLog).toMatch(/Page/)
        expect(hydrationErrorLog).toMatch(/app\/hydration-error\/page/)
      })

      // Assert the entire hydration error message including owner stack trace
      expect(hydrationErrorLog).toMatchInlineSnapshot(`
       "[browser] Uncaught Error: Hydration failed because the server rendered text didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:

       - A server/client branch \`if (typeof window !== 'undefined')\`.
       - Variable input such as \`Date.now()\` or \`Math.random()\` which changes each time it's called.
       - Date formatting in a user's locale which doesn't match the server.
       - External changing data without sending a snapshot of it along with the HTML.
       - Invalid HTML tag nesting.

       It can also happen if the client has a browser extension installed which messes with the HTML before React loaded.

       https://react.dev/link/hydration-mismatch

         ...
           <RenderFromTemplateContext>
             <ScrollAndFocusHandler segmentPath={[...]}>
               <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
                 <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                   <LoadingBoundary name="hydration-..." loading={null}>
                     <HTTPAccessFallbackBoundary notFound={undefined} forbidden={undefined} unauthorized={undefined}>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/hydration..." tree={[...]} params={{}} cacheNode={{rsc:<Fragment>, ...}} ...>
                             <SegmentViewNode type="page" pagePath="hydration-...">
                               <SegmentTrieNode>
                               <ClientPageRoot Component={function Page} serverProvidedParams={{...}}>
                                 <Page params={Promise} searchParams={Promise}>
                                   <div>
                                     <p>
       +                               client
       -                               server
                             ...
                           ...
                 ...

           at <unknown> (https://react.dev/link/hydration-mismatch)
           at p (<anonymous>)
           at Page (app/hydration-error/page.js:7:7)
          5 |   return (
          6 |     <div>
       >  7 |       <p>{isClient ? 'client' : 'server'}</p>
            |       ^
          8 |     </div>
          9 |   )
         10 | }
       "
      `)

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
          'next.config.js': new FileRef(
            join(__dirname, 'fixtures/next.config.js')
          ),
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
})
