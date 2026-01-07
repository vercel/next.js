import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('get_routes MCP tool', () => {
  const { next, skipped } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'dynamic-routes-app'),
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  async function callGetRoutes(
    id: string,
    args: Record<string, unknown> = {}
  ): Promise<string> {
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
        params: { name: 'get_routes', arguments: args },
      }),
    })

    const text = await response.text()
    const match = text.match(/data: ({.*})/s)
    const result = JSON.parse(match![1])
    return result.result?.content?.[0]?.text
  }

  it('should return all routes via MCP get_routes tool without visiting pages', async () => {
    // The tool should discover all routes by scanning the filesystem,
    // without needing to visit/compile any pages first
    const sessionId = 'test-mcp-routes-' + Date.now()
    const responseText = await callGetRoutes(sessionId)

    expect(responseText).toBeTruthy()
    const response = JSON.parse(responseText)

    // Snapshot the discovered routes grouped by router type
    // Note: Dynamic routes show parameter patterns like [id], [slug], [...slug]
    expect(response).toMatchInlineSnapshot(`
      {
        "appRouter": [
          "/",
          "/api/users/[id]",
          "/blog/[slug]",
          "/docs/[...slug]",
          "/products/[id]",
        ],
        "pagesRouter": [
          "/about",
          "/api/legacy",
          "/posts/[id]",
        ],
      }
    `)
  })

  it('should filter routes by routerType parameter', async () => {
    // Test app-only filter
    const appOnlyResponse = JSON.parse(
      await callGetRoutes('test-app-only', { routerType: 'app' })
    )
    expect(appOnlyResponse).toMatchInlineSnapshot(`
      {
        "appRouter": [
          "/",
          "/api/users/[id]",
          "/blog/[slug]",
          "/docs/[...slug]",
          "/products/[id]",
        ],
      }
    `)

    // Test pages-only filter
    const pagesOnlyResponse = JSON.parse(
      await callGetRoutes('test-pages-only', { routerType: 'pages' })
    )
    expect(pagesOnlyResponse).toMatchInlineSnapshot(`
      {
        "pagesRouter": [
          "/about",
          "/api/legacy",
          "/posts/[id]",
        ],
      }
    `)
  })
})
