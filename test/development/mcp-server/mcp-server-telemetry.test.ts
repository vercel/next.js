import { FileRef, nextTestSetup } from 'e2e-utils'
import { findAllTelemetryEvents } from 'next-test-utils'
import path from 'path'

describe('mcp-server telemetry tracking', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    env: {
      NEXT_TELEMETRY_DEBUG: '1',
    },
  })

  async function callMcpTool(
    toolName: string,
    params: Record<string, any> = {}
  ) {
    const response = await fetch(`${next.url}/_next/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `telemetry-test-${Date.now()}`,
        method: 'tools/call',
        params: { name: toolName, arguments: params },
      }),
    })

    const text = await response.text()
    const match = text.match(/data: ({.*})/s)
    if (!match) {
      throw new Error(`Failed to parse response for tool ${toolName}`)
    }
    return JSON.parse(match[1])
  }

  it('should record MCP tool usage telemetry on server shutdown', async () => {
    // Call different MCP tools
    await callMcpTool('get_project_metadata')
    await callMcpTool('get_logs')
    await callMcpTool('get_errors')

    // Open browser and call page_metadata
    await next.browser('/')
    await callMcpTool('get_page_metadata')

    // Call some tools multiple times
    await callMcpTool('get_project_metadata')
    await callMcpTool('get_errors')

    // Stop the dev server to trigger telemetry recording
    // Use SIGTERM so cleanup handlers can run
    await next.stop('SIGTERM')

    // Parse telemetry from CLI output
    const output = next.cliOutput
    const events = findAllTelemetryEvents(output, 'NEXT_MCP_TOOL_USAGE')

    // Verify telemetry events were recorded
    expect(events.length).toBeGreaterThan(0)

    // Check that specific tools were tracked
    const toolUsages = new Map(
      events.map((e) => [e.toolName, e.invocationCount])
    )

    // get_project_metadata was called 2 times
    expect(toolUsages.get('mcp/get_project_metadata')).toBe(2)

    // get_errors was called 2 times
    expect(toolUsages.get('mcp/get_errors')).toBe(2)

    // get_logs was called 1 time
    expect(toolUsages.get('mcp/get_logs')).toBe(1)

    // get_page_metadata was called 1 time
    expect(toolUsages.get('mcp/get_page_metadata')).toBe(1)
  })
})
