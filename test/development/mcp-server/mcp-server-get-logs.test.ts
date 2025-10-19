import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('get-logs MCP tool', () => {
  const { next, skipped } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'log-file-app'),
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  async function callGetLogs(id: string): Promise<string> {
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
        params: { name: 'get_logs', arguments: {} },
      }),
    })

    const text = await response.text()
    const match = text.match(/data: ({.*})/s)
    const result = JSON.parse(match![1])
    return result.result?.content?.[0]?.text
  }

  it('should return log file path via MCP get_logs tool', async () => {
    // Generate some logs by visiting pages that create log entries
    await next.browser('/server')
    await next.browser('/client')
    await next.browser('/pages-router-page')

    await retry(async () => {
      const sessionId = 'test-mcp-logs-' + Date.now()
      const response = await callGetLogs(sessionId)

      // Should return the log file path
      expect(response).toContain('Next.js log file path:')
      expect(response).toContain('logs/next-development.log')
      expect(response).not.toContain('Log file not found at')
    })
  })
})
