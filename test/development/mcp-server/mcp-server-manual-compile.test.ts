import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { retry, waitFor, waitForNoRedbox } from 'next-test-utils'

// pause_compilation/compile_and_resume require Turbopack — they are
// no-ops in the webpack hot reloader.
;(process.env.IS_WEBPACK_TEST ? describe.skip : describe)(
  'mcp-server manual compile tools',
  () => {
    const { next, skipped } = nextTestSetup({
      files: new FileRef(
        path.join(__dirname, 'fixtures', 'manual-compile-app')
      ),
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    async function callMcpTool(
      name: string,
      args: Record<string, unknown> = {}
    ) {
      const response = await fetch(`${next.url}/_next/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `${name}-${Date.now()}`,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      })

      const text = await response.text()
      const match = text.match(/data: ({.*})/s)
      expect(match).toBeTruthy()
      const result = JSON.parse(match![1])
      return JSON.parse(result.result?.content?.[0]?.text)
    }

    it('should batch edits without leaking errors and flush with a compilation', async () => {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('h1').text()).toBe(
        'Hello from Manual Compile Test'
      )

      // Pause compilation
      const pauseResult = await callMcpTool('pause_compilation')
      expect(pauseResult.status).toBe('compilation_paused')

      // 1. Make an edit that would cause a compilation error:
      //    import from a module that doesn't exist yet
      await next.patchFile(
        'app/page.tsx',
        `import { greeting } from './utils'
export default function Page() {
  return <h1>{greeting}</h1>
}`
      )

      // Wait long enough for a normal HMR cycle to have completed
      await waitFor(3000)

      // Browser should still show old content, no error overlay
      expect(await browser.elementByCss('h1').text()).toBe(
        'Hello from Manual Compile Test'
      )
      await waitForNoRedbox(browser, { waitInMs: 0 })

      // 2. Fix the error by creating the missing module,
      //    and update the page to its final state
      await next.patchFile(
        'app/utils.ts',
        `export const greeting = 'Manual Compile Works'`
      )

      // Wait again — browser should still show old content
      await waitFor(3000)
      expect(await browser.elementByCss('h1').text()).toBe(
        'Hello from Manual Compile Test'
      )
      await waitForNoRedbox(browser, { waitInMs: 0 })

      // Record the CLI output length before flushing so we can check
      // that compilation activity appears after compile_and_resume
      const outputLengthBeforeFlush = next.cliOutput.length

      // 3. Flush: compile_and_resume triggers one compilation from the
      //    final file state and waits for it to finish
      const resumeResult = await callMcpTool('compile_and_resume')
      expect(resumeResult.status).toBe('compiled_and_resumed')

      // Browser should update to the final state
      await retry(async () => {
        expect(await browser.elementByCss('h1').text()).toBe(
          'Manual Compile Works'
        )
      })

      // No error overlay after flush
      await waitForNoRedbox(browser, { waitInMs: 0 })

      // The flush must have triggered a compilation — verify that the
      // server handled requests for the updated page
      await retry(async () => {
        const outputAfterFlush = next.cliOutput.substring(
          outputLengthBeforeFlush
        )
        expect(outputAfterFlush).toContain('GET / 200')
      })

      // 4. Normal HMR resumes — edits apply without manual mode
      await next.patchFile(
        'app/page.tsx',
        `export default function Page() {
  return <h1>Hello from Manual Compile Test</h1>
}`
      )
      await next.deleteFile('app/utils.ts')
      await retry(async () => {
        expect(await browser.elementByCss('h1').text()).toBe(
          'Hello from Manual Compile Test'
        )
      })
    })

    it('should handle compile_and_resume without paused compilation as a no-op', async () => {
      const result = await callMcpTool('compile_and_resume')
      expect(result.status).toBe('compiled_and_resumed')
    })
  }
)
