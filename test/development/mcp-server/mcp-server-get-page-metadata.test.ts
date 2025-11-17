import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'
import { launchStandaloneSession } from './test-utils'

describe('mcp-server get_page_metadata tool', () => {
  async function callGetPageMetadata(url: string, id: string) {
    const response = await fetch(`${url}/_next/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: 'get_page_metadata', arguments: {} },
      }),
    })

    const text = await response.text()
    const match = text.match(/data: ({.*})/s)
    const result = JSON.parse(match![1])
    return result.result?.content?.[0]?.text
  }

  describe('app router', () => {
    const { next } = nextTestSetup({
      files: new FileRef(
        path.join(__dirname, 'fixtures', 'parallel-routes-template')
      ),
    })

    it('should return metadata for basic page', async () => {
      await next.browser('/')
      const metadata = await callGetPageMetadata(next.url, 'test-basic')

      expect(stripAnsi(metadata)).toMatchInlineSnapshot(`
       "# Page metadata from 1 browser session(s)

       ## Session: /

       **Router type:** app

       ### Files powering this page:

       - app/layout.tsx
       - global-error.js (boundary, builtin)
       - app/error.tsx (boundary)
       - app/loading.tsx (boundary)
       - app/not-found.tsx (boundary)
       - app/page.tsx

       ---"
      `)
    })

    it('should return metadata for parallel routes', async () => {
      await next.browser('/parallel')

      let metadata: string = ''
      await retry(async () => {
        const sessionId = 'test-parallel-' + Date.now()
        metadata = await callGetPageMetadata(next.url, sessionId)
        expect(metadata).toContain('Page metadata from 1 browser session')
        expect(metadata).toContain('Files powering this page')
        // Ensure we have the parallel route files
        expect(metadata).toContain('app/parallel/@sidebar/page.tsx')
        expect(metadata).toContain('app/parallel/@content/page.tsx')
        expect(metadata).toContain('app/parallel/page.tsx')
      })

      expect(stripAnsi(metadata)).toMatchInlineSnapshot(`
       "# Page metadata from 1 browser session(s)

       ## Session: /parallel

       **Router type:** app

       ### Files powering this page:

       - app/layout.tsx
       - app/parallel/layout.tsx
       - global-error.js (boundary, builtin)
       - app/error.tsx (boundary)
       - app/loading.tsx (boundary)
       - app/not-found.tsx (boundary)
       - app/parallel/@content/error.tsx (boundary)
       - app/parallel/@sidebar/loading.tsx (boundary)
       - app/parallel/error.tsx (boundary)
       - app/parallel/loading.tsx (boundary)
       - app/parallel/@content/page.tsx
       - app/parallel/@sidebar/page.tsx
       - app/parallel/page.tsx

       ---"
      `)
    })

    it('should handle multiple browser sessions', async () => {
      // Open two browser tabs using standalone sessions for true concurrent tabs
      const session1 = await launchStandaloneSession(next.url, '/')
      const session2 = await launchStandaloneSession(next.url, '/parallel')

      try {
        await new Promise((resolve) => setTimeout(resolve, 1000))

        let metadata: string = ''
        await retry(async () => {
          const sessionId = 'test-multi-' + Date.now()
          metadata = await callGetPageMetadata(next.url, sessionId)
          expect(metadata).toMatch(/Page metadata from \d+ browser session/)
          // Ensure both our sessions are present
          expect(metadata).toContain('Session: /')
          expect(metadata).toContain('Session: /parallel')
        })

        const strippedMetadata = stripAnsi(metadata)

        // Extract each session's content to check them independently
        const session1Match = strippedMetadata.match(
          /## Session: \/\n[\s\S]*?(?=(\n## Session:|\n?$))/
        )
        const session2Match = strippedMetadata.match(
          /## Session: \/parallel\n[\s\S]*?(?=(\n## Session:|\n?$))/
        )

        // Trim trailing newline if present
        if (session1Match) session1Match[0] = session1Match[0].trimEnd()
        if (session2Match) session2Match[0] = session2Match[0].trimEnd()

        expect(session1Match).toBeTruthy()
        expect(session2Match).toBeTruthy()

        expect(session1Match?.[0]).toMatchInlineSnapshot(`
         "## Session: /

         **Router type:** app

         ### Files powering this page:

         - app/layout.tsx
         - global-error.js (boundary, builtin)
         - app/error.tsx (boundary)
         - app/loading.tsx (boundary)
         - app/not-found.tsx (boundary)
         - app/page.tsx

         ---"
        `)

        expect(session2Match?.[0]).toMatchInlineSnapshot(`
         "## Session: /parallel

         **Router type:** app

         ### Files powering this page:

         - app/layout.tsx
         - app/parallel/layout.tsx
         - global-error.js (boundary, builtin)
         - app/error.tsx (boundary)
         - app/loading.tsx (boundary)
         - app/not-found.tsx (boundary)
         - app/parallel/@content/error.tsx (boundary)
         - app/parallel/@sidebar/loading.tsx (boundary)
         - app/parallel/error.tsx (boundary)
         - app/parallel/loading.tsx (boundary)
         - app/parallel/@content/page.tsx
         - app/parallel/@sidebar/page.tsx
         - app/parallel/page.tsx

         ---"
        `)
      } finally {
        // Clean up sessions
        await session1.close()
        await session2.close()
      }
    })

    it('should count multiple browser tabs with the same URL separately', async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))

      const session1 = await launchStandaloneSession(next.url, '/')
      const session2 = await launchStandaloneSession(next.url, '/')

      try {
        await new Promise((resolve) => setTimeout(resolve, 1000))

        let metadata: string = ''
        await retry(async () => {
          const sessionId = 'test-same-url-' + Date.now()
          metadata = await callGetPageMetadata(next.url, sessionId)
          const rootSessions = (metadata.match(/## Session: \/(?!\w)/g) || [])
            .length
          expect(rootSessions).toBeGreaterThanOrEqual(2)
        })

        const rootSessions = (metadata.match(/## Session: \/(?!\w)/g) || [])
          .length
        expect(rootSessions).toBeGreaterThanOrEqual(2)
      } finally {
        await session1.close()
        await session2.close()
      }
    })
  })

  describe('pages router', () => {
    const { next } = nextTestSetup({
      files: new FileRef(
        path.join(__dirname, 'fixtures', 'pages-router-template')
      ),
    })

    it('should return metadata showing pages router type', async () => {
      await next.browser('/')

      let metadata: string = ''
      await retry(async () => {
        const sessionId = 'test-pages-' + Date.now()
        metadata = await callGetPageMetadata(next.url, sessionId)
        expect(metadata).toContain('Page metadata from 1 browser session')
      })

      expect(stripAnsi(metadata)).toMatchInlineSnapshot(`
          "# Page metadata from 1 browser session(s)

          ## Session: /

          **Router type:** pages

          *No segments found*

          ---"
        `)
    })

    it('should show pages router type for about page', async () => {
      await next.browser('/about')

      let metadata: string = ''
      await retry(async () => {
        const sessionId = 'test-pages-about-' + Date.now()
        metadata = await callGetPageMetadata(next.url, sessionId)
        expect(metadata).toContain('Page metadata from 1 browser session')
      })

      expect(stripAnsi(metadata)).toMatchInlineSnapshot(`
          "# Page metadata from 1 browser session(s)

          ## Session: /about

          **Router type:** pages

          *No segments found*

          ---"
        `)
    })
  })
})
