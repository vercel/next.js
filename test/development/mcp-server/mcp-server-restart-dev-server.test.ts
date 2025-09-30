import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('restart-dev-server MCP tool', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'log-file-app'),
  })

  async function callRestartDevServer(id: string): Promise<string> {
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
        params: { name: 'restart_dev_server', arguments: {} },
      }),
    })

    const text = await response.text()
    const match = text.match(/data: ({.*})/s)
    const result = JSON.parse(match![1])
    return result.result?.content?.[0]?.text
  }

  async function getServerStatus(): Promise<{ executionId: number }> {
    const response = await fetch(`${next.url}/__nextjs_server_status`)
    if (!response.ok) {
      throw new Error(
        `Server status request failed with status ${response.status}`
      )
    }
    return response.json()
  }

  it('should call restart dev server MCP tool and handle server restart', async () => {
    const sessionId = 'test-mcp-restart-' + Date.now()

    // Make the call and expect either a successful response or a connection error
    // (since the server will restart after responding)
    let response: string | null = null
    let error: Error | null = null

    try {
      response = await callRestartDevServer(sessionId)
    } catch (err) {
      error = err as Error
    }

    // Either we get a successful response with restart message, or a connection error
    if (response) {
      expect(response).toContain('Dev server restart initiated')
      expect(response).toContain('The server will restart shortly')
    } else if (error) {
      // Connection errors are expected when the server restarts
      expect(error.message).toMatch(/fetch failed|ECONNRESET|EPIPE|connection/i)
    } else {
      throw new Error('Expected either a response or an error')
    }
  })

  it('should have restart_dev_server tool available in MCP server', async () => {
    // Test that the tool is registered by checking if we can make the call
    // without getting a "tool not found" error
    const sessionId = 'test-mcp-tool-available-' + Date.now()

    try {
      const response = await callRestartDevServer(sessionId)
      // If we get here, the tool exists and responded
      expect(response).toBeDefined()
      expect(typeof response).toBe('string')
    } catch (error) {
      // If it's a connection error, that means the tool was called and server restarted
      // If it's a "tool not found" error, that would be a different error message
      const errorMessage = (error as Error).message
      expect(errorMessage).toMatch(
        /fetch failed|ECONNRESET|EPIPE|connection|Dev server restart/i
      )
    }
  })

  it('should verify server restart by checking execution ID change', async () => {
    // Get the initial server execution ID
    const initialStatus = await retry(async () => {
      return await getServerStatus()
    }, 5000)
    const initialExecutionId = initialStatus.executionId

    expect(initialExecutionId).toBeDefined()
    expect(typeof initialExecutionId).toBe('number')

    // Call the restart tool
    const sessionId = 'test-mcp-restart-verification-' + Date.now()

    try {
      await callRestartDevServer(sessionId)
    } catch (error) {
      // Connection error is expected when server restarts
      expect((error as Error).message).toMatch(
        /fetch failed|ECONNRESET|EPIPE|connection/i
      )
    }

    // Wait a bit for the server to restart
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Get the new server execution ID after restart
    const newStatus = await retry(async () => {
      return await getServerStatus()
    }, 10000)
    const newExecutionId = newStatus.executionId

    // The execution ID should be different, indicating the server actually restarted
    expect(newExecutionId).toBeDefined()
    expect(newExecutionId).not.toBe(initialExecutionId)
    expect(typeof newExecutionId).toBe('number')
  })
})
