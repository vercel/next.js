import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { retry } from 'next-test-utils'
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
      const metadataText = await callGetPageMetadata(next.url, 'test-basic')
      const metadata = JSON.parse(metadataText)

      expect(metadata.sessions).toHaveLength(1)
      expect(metadata.sessions[0]).toMatchObject({
        url: '/',
        routerType: 'app',
      })
      expect(metadata.sessions[0].segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'app/layout.tsx' }),
          expect.objectContaining({
            path: 'global-error.js',
            isBoundary: true,
            isBuiltin: true,
          }),
          expect.objectContaining({ path: 'app/error.tsx', isBoundary: true }),
          expect.objectContaining({
            path: 'app/loading.tsx',
            isBoundary: true,
          }),
          expect.objectContaining({
            path: 'app/not-found.tsx',
            isBoundary: true,
          }),
          expect.objectContaining({ path: 'app/page.tsx' }),
        ])
      )
    })

    it('should return metadata for parallel routes', async () => {
      await next.browser('/parallel')

      let metadata: any = null
      await retry(async () => {
        const sessionId = 'test-parallel-' + Date.now()
        const metadataText = await callGetPageMetadata(next.url, sessionId)
        metadata = JSON.parse(metadataText)
        expect(metadata.sessions).toHaveLength(1)
        // Ensure we have the parallel route files
        const paths = metadata.sessions[0].segments.map((s: any) => s.path)
        expect(paths).toContain('app/parallel/@sidebar/page.tsx')
        expect(paths).toContain('app/parallel/@content/page.tsx')
        expect(paths).toContain('app/parallel/page.tsx')
      })

      expect(metadata.sessions[0]).toMatchObject({
        url: '/parallel',
        routerType: 'app',
      })
      expect(metadata.sessions[0].segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'app/layout.tsx' }),
          expect.objectContaining({ path: 'app/parallel/layout.tsx' }),
          expect.objectContaining({
            path: 'global-error.js',
            isBoundary: true,
            isBuiltin: true,
          }),
          expect.objectContaining({ path: 'app/parallel/@content/page.tsx' }),
          expect.objectContaining({ path: 'app/parallel/@sidebar/page.tsx' }),
          expect.objectContaining({ path: 'app/parallel/page.tsx' }),
        ])
      )
    })

    it('should handle multiple browser sessions', async () => {
      // Open two browser tabs using standalone sessions for true concurrent tabs
      const session1 = await launchStandaloneSession(next.url, '/')
      const session2 = await launchStandaloneSession(next.url, '/parallel')

      try {
        await new Promise((resolve) => setTimeout(resolve, 1000))

        let metadata: any = null
        await retry(async () => {
          const sessionId = 'test-multi-' + Date.now()
          const metadataText = await callGetPageMetadata(next.url, sessionId)
          metadata = JSON.parse(metadataText)
          expect(metadata.sessions.length).toBeGreaterThanOrEqual(2)
          // Ensure both our sessions are present
          const urls = metadata.sessions.map((s: any) => s.url)
          expect(urls).toContain('/')
          expect(urls).toContain('/parallel')
        })

        // Find each session's metadata
        const rootSession = metadata.sessions.find((s: any) => s.url === '/')
        const parallelSession = metadata.sessions.find(
          (s: any) => s.url === '/parallel'
        )

        expect(rootSession).toMatchObject({
          url: '/',
          routerType: 'app',
        })
        expect(rootSession.segments).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ path: 'app/layout.tsx' }),
            expect.objectContaining({ path: 'app/page.tsx' }),
          ])
        )

        expect(parallelSession).toMatchObject({
          url: '/parallel',
          routerType: 'app',
        })
        expect(parallelSession.segments).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ path: 'app/layout.tsx' }),
            expect.objectContaining({ path: 'app/parallel/layout.tsx' }),
            expect.objectContaining({ path: 'app/parallel/@content/page.tsx' }),
            expect.objectContaining({ path: 'app/parallel/@sidebar/page.tsx' }),
            expect.objectContaining({ path: 'app/parallel/page.tsx' }),
          ])
        )
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

        let metadata: any = null
        await retry(async () => {
          const sessionId = 'test-same-url-' + Date.now()
          const metadataText = await callGetPageMetadata(next.url, sessionId)
          metadata = JSON.parse(metadataText)
          const rootSessions = metadata.sessions.filter(
            (s: any) => s.url === '/'
          ).length
          expect(rootSessions).toBeGreaterThanOrEqual(2)
        })

        const rootSessions = metadata.sessions.filter(
          (s: any) => s.url === '/'
        ).length
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

      let metadata: any = null
      await retry(async () => {
        const sessionId = 'test-pages-' + Date.now()
        const metadataText = await callGetPageMetadata(next.url, sessionId)
        metadata = JSON.parse(metadataText)
        expect(metadata.sessions).toHaveLength(1)
      })

      expect(metadata.sessions[0]).toMatchObject({
        url: '/',
        routerType: 'pages',
        segments: [],
      })
    })

    it('should show pages router type for about page', async () => {
      await next.browser('/about')

      let metadata: any = null
      await retry(async () => {
        const sessionId = 'test-pages-about-' + Date.now()
        const metadataText = await callGetPageMetadata(next.url, sessionId)
        metadata = JSON.parse(metadataText)
        expect(metadata.sessions).toHaveLength(1)
      })

      expect(metadata.sessions[0]).toMatchObject({
        url: '/about',
        routerType: 'pages',
        segments: [],
      })
    })
  })
})
