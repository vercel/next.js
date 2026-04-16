import path from 'path'
import { nextTestSetup } from 'e2e-utils'

async function callMcpTool(
  url: string,
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<unknown> {
  const response = await fetch(`${url}/_next/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: toolName + '-' + Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  })
  const text = await response.text()
  const match = text.match(/data: ({.*})/s)
  expect(match).toBeTruthy()
  const envelope = JSON.parse(match![1])
  return JSON.parse(envelope.result?.content?.[0]?.text)
}

// compile_route is Turbopack-only; it is not registered on webpack dev servers.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'mcp-server compile_route tool',
  () => {
    const { next, skipped } = nextTestSetup({
      files: path.join(__dirname, 'fixtures', 'dynamic-routes-app'),
    })

    if (skipped) {
      return
    }

    it('should compile a valid app router root route', async () => {
      const result = await callMcpTool(next.url, 'compile_route', {
        page: '/',
      })
      expect(result).toMatchObject({ page: '/', issues: [] })
    })

    it('should compile a valid dynamic app router route', async () => {
      const result = await callMcpTool(next.url, 'compile_route', {
        page: '/blog/[slug]',
      })
      expect(result).toMatchObject({ page: '/blog/[slug]', issues: [] })
    })

    it('should compile a valid pages router route', async () => {
      const result = await callMcpTool(next.url, 'compile_route', {
        page: '/about',
      })
      expect(result).toMatchObject({ page: '/about', issues: [] })
    })

    it('should compile a valid app router API route', async () => {
      const result = await callMcpTool(next.url, 'compile_route', {
        page: '/api/users/[id]',
      })
      expect(result).toMatchObject({ page: '/api/users/[id]', issues: [] })
    })

    it('should compile a valid pages router API route', async () => {
      const result = await callMcpTool(next.url, 'compile_route', {
        page: '/api/legacy',
      })
      expect(result).toMatchObject({ page: '/api/legacy', issues: [] })
    })

    it('should return an error for a non-existent route', async () => {
      const result = (await callMcpTool(next.url, 'compile_route', {
        page: '/does-not-exist',
      })) as any
      expect(result).toMatchObject({ notFound: true, page: '/does-not-exist' })
    })
  }
)

// Compilation errors don't throw from ensurePage — they are collected from
// Turbopack's per-entry issue map and returned directly in the compile_route
// response, so no second round-trip to get_compilation_issues is needed.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'mcp-server compile_route with compilation errors',
  () => {
    const { next, skipped } = nextTestSetup({
      files: path.join(__dirname, 'fixtures', 'compilation-errors-app'),
    })

    if (skipped) {
      return
    }

    it('should return compilation issues inline in the response', async () => {
      const result = (await callMcpTool(next.url, 'compile_route', {
        page: '/missing-module',
      })) as {
        compiled: boolean
        page: string
        issues: Array<{ severity: string; filePath: string; title: string }>
      }

      expect(result.page).toBe('/missing-module')
      expect(result.issues.length).toBeGreaterThan(0)

      const moduleNotFound = result.issues.find(
        (issue) =>
          (issue.severity === 'error' || issue.severity === 'fatal') &&
          (issue.filePath.includes('missing-module') ||
            issue.title.includes('non-existent-module'))
      )
      expect(moduleNotFound).toBeDefined()
    })
  }
)
