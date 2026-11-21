import path from 'path'
import { nextTestSetup } from 'e2e-utils'

// get_compilation_issues is a Turbopack-only feature (requires NAPI project handle)
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'mcp-server get_compilation_issues tool with Pages Router routes',
  () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures', 'pages-router-template'),
    })

    async function callMcpTool() {
      const response = await fetch(`${next.url}/_next/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'get-compilation-issues',
          method: 'tools/call',
          params: { name: 'get_compilation_issues', arguments: {} },
        }),
      })

      const text = await response.text()
      const match = text.match(/data: ({.*})/s)
      expect(match).toBeTruthy()
      const result = JSON.parse(match![1])
      return result.result?.content?.[0]?.text as string
    }

    // The tool builds a single module graph from every endpoint. In development, Pages Router
    // pages have both an HTML and a data endpoint, whose `_app` and `_document` modules must not
    // collide (builds with debug assertions reject duplicate module idents in a graph).
    it('reports no issues for a valid app', async () => {
      const text = await callMcpTool()
      expect(text).not.toContain('Duplicate module idents')
      expect(JSON.parse(text)).toEqual({ issues: [] })
    })
  }
)
