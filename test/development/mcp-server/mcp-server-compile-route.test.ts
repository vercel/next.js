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

    describe('routeSpecifier input', () => {
      it('should compile a valid app router root route', async () => {
        const result = await callMcpTool(next.url, 'compile_route', {
          routeSpecifier: '/',
        })
        expect(result).toMatchObject({ routeSpecifier: '/', issues: [] })
      })

      it('should compile a valid dynamic app router route', async () => {
        const result = await callMcpTool(next.url, 'compile_route', {
          routeSpecifier: '/blog/[slug]',
        })
        expect(result).toMatchObject({
          routeSpecifier: '/blog/[slug]',
          issues: [],
        })
      })

      it('should compile a valid pages router route', async () => {
        const result = await callMcpTool(next.url, 'compile_route', {
          routeSpecifier: '/about',
        })
        expect(result).toMatchObject({ routeSpecifier: '/about', issues: [] })
      })

      it('should compile a valid app router API route', async () => {
        const result = await callMcpTool(next.url, 'compile_route', {
          routeSpecifier: '/api/users/[id]',
        })
        expect(result).toMatchObject({
          routeSpecifier: '/api/users/[id]',
          issues: [],
        })
      })

      it('should compile a valid pages router API route', async () => {
        const result = await callMcpTool(next.url, 'compile_route', {
          routeSpecifier: '/api/legacy',
        })
        expect(result).toMatchObject({
          routeSpecifier: '/api/legacy',
          issues: [],
        })
      })

      it('should return notFound for a non-existent specifier', async () => {
        const result = (await callMcpTool(next.url, 'compile_route', {
          routeSpecifier: '/does-not-exist',
        })) as any
        expect(result).toMatchObject({
          notFound: true,
          input: '/does-not-exist',
        })
      })
    })

    describe('path input', () => {
      it('should resolve a static app route path', async () => {
        const result = await callMcpTool(next.url, 'compile_route', {
          path: '/',
        })
        expect(result).toMatchObject({ routeSpecifier: '/', issues: [] })
      })

      it('should resolve a dynamic app route path', async () => {
        const result = await callMcpTool(next.url, 'compile_route', {
          path: '/blog/hello-world',
        })
        expect(result).toMatchObject({
          routeSpecifier: '/blog/[slug]',
          issues: [],
        })
      })

      it('should resolve a catchall app route path', async () => {
        const result = await callMcpTool(next.url, 'compile_route', {
          path: '/docs/a/b/c',
        })
        expect(result).toMatchObject({
          routeSpecifier: '/docs/[...slug]',
          issues: [],
        })
      })

      it('should strip query string before matching', async () => {
        const result = await callMcpTool(next.url, 'compile_route', {
          path: '/products/42?ref=x',
        })
        expect(result).toMatchObject({
          routeSpecifier: '/products/[id]',
          issues: [],
        })
      })

      it('should resolve a pages router dynamic path', async () => {
        const result = await callMcpTool(next.url, 'compile_route', {
          path: '/posts/7',
        })
        expect(result).toMatchObject({
          routeSpecifier: '/posts/[id]',
          issues: [],
        })
      })

      it('should resolve an app router API path', async () => {
        const result = await callMcpTool(next.url, 'compile_route', {
          path: '/api/users/42',
        })
        expect(result).toMatchObject({
          routeSpecifier: '/api/users/[id]',
          issues: [],
        })
      })

      it('should resolve a static pages router path', async () => {
        const result = await callMcpTool(next.url, 'compile_route', {
          path: '/about',
        })
        expect(result).toMatchObject({ routeSpecifier: '/about', issues: [] })
      })

      it('should strip a trailing slash before matching', async () => {
        const result = await callMcpTool(next.url, 'compile_route', {
          path: '/about/',
        })
        expect(result).toMatchObject({ routeSpecifier: '/about', issues: [] })
      })

      it('should return notFound when no route matches', async () => {
        const result = (await callMcpTool(next.url, 'compile_route', {
          path: '/nope/x',
        })) as any
        expect(result).toMatchObject({ notFound: true, input: '/nope/x' })
      })
    })

    describe('input validation', () => {
      it('should error when both routeSpecifier and path are provided', async () => {
        const result = (await callMcpTool(next.url, 'compile_route', {
          routeSpecifier: '/',
          path: '/',
        })) as any
        expect(result).toMatchObject({
          error: expect.stringContaining('exactly one'),
        })
      })

      it('should error when neither routeSpecifier nor path is provided', async () => {
        const result = (await callMcpTool(next.url, 'compile_route', {})) as any
        expect(result).toMatchObject({
          error: expect.stringContaining('exactly one'),
        })
      })
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
        routeSpecifier: '/missing-module',
      })) as {
        routeSpecifier: string
        issues: Array<{ severity: string; filePath: string; title: string }>
      }

      expect(result.routeSpecifier).toBe('/missing-module')
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
