import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('mcp-server', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
  })

  async function initializeMCPSession(
    mcpEndpoint: string,
    id: string
  ): Promise<any> {
    const initResponse = await fetch(mcpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'initialize',
        params: {
          protocolVersion: '1.0.0',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      }),
    })

    const initText = await initResponse.text()
    const dataMatch = initText.match(/data: ({.*})/s)
    if (!dataMatch) {
      throw new Error(`Unexpected response format: ${initText}`)
    }

    const initResult = JSON.parse(dataMatch[1])
    if (initResult.error) {
      throw new Error(`MCP error: ${JSON.stringify(initResult.error)}`)
    }

    return initResult
  }

  it('should initialize MCP server and list available tools', async () => {
    const mcpEndpoint = `${next.url}/_next/mcp`

    // Initialize MCP session
    const initResult = await initializeMCPSession(mcpEndpoint, 'init-1')

    expect(initResult.jsonrpc).toBe('2.0')
    expect(initResult.id).toBe('init-1')
    expect(initResult.result?.serverInfo?.name).toBe('Next.js MCP Server')

    // List available tools
    const listToolsResponse = await fetch(mcpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'list-tools-1',
        method: 'tools/list',
        params: {},
      }),
    })

    const listToolsText = await listToolsResponse.text()
    const listToolsDataMatch = listToolsText.match(/data: ({.*})/s)
    if (!listToolsDataMatch) {
      throw new Error(`Unexpected response format: ${listToolsText}`)
    }
    const listToolsResult = JSON.parse(listToolsDataMatch[1])

    expect(listToolsResult.result?.tools).toBeInstanceOf(Array)

    const projectDirTool = listToolsResult.result?.tools?.find(
      (tool: { name: string }) => tool.name === 'get_project_path'
    )
    expect(projectDirTool).toBeDefined()
    expect(projectDirTool?.description).toBe(
      'Returns the absolute path of the root directory for this Next.js project.'
    )
  })

  it('should return exact absolute path for get_project_path tool', async () => {
    const mcpEndpoint = `${next.url}/_next/mcp`

    // Initialize MCP session (required before calling tools)
    await initializeMCPSession(mcpEndpoint, 'init-2')

    // Call get_project_path tool and verify response
    const callToolResponse = await fetch(mcpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'call-tool-1',
        method: 'tools/call',
        params: {
          name: 'get_project_path',
          arguments: {},
        },
      }),
    })

    const callToolText = await callToolResponse.text()
    const callToolDataMatch = callToolText.match(/data: ({.*})/s)
    if (!callToolDataMatch) {
      throw new Error(`Unexpected response format: ${callToolText}`)
    }
    const callToolResult = JSON.parse(callToolDataMatch[1])

    expect(callToolResult.jsonrpc).toBe('2.0')
    expect(callToolResult.id).toBe('call-tool-1')

    const content = callToolResult.result?.content
    expect(content).toBeInstanceOf(Array)
    expect(content?.[0]?.type).toBe('text')

    // Get the actual project path from the response
    const actualProjectPath = content?.[0]?.text

    // Project directory should match the test directory from the test harness
    expect(actualProjectPath).toBe(next.testDir)
  })
})
