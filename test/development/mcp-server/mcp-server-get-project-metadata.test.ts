import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('mcp-server get_project_metadata tool', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
  })
  it('should return correct project metadata via get_project_metadata tool', async () => {
    const mcpEndpoint = `${next.url}/_next/mcp`

    // Call get_project_metadata tool
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
          name: 'get_project_metadata',
          arguments: {},
        },
      }),
    })

    const callToolText = await callToolResponse.text()
    const callToolDataMatch = callToolText.match(/data: ({.*})/s)
    expect(callToolDataMatch).toBeTruthy()

    const callToolResult = JSON.parse(callToolDataMatch![1])
    expect(callToolResult.jsonrpc).toBe('2.0')
    expect(callToolResult.id).toBe('call-tool-1')

    const content = callToolResult.result?.content
    expect(content).toBeInstanceOf(Array)
    expect(content?.[0]?.type).toBe('text')

    const metadataText = content?.[0]?.text
    expect(metadataText).toBeTruthy()

    const metadata = JSON.parse(metadataText)

    // Verify projectPath
    expect(metadata.projectPath).toBeTruthy()
    expect(path.isAbsolute(metadata.projectPath)).toBe(true)
    expect(metadata.projectPath).toBe(next.testDir)

    // Verify devServerUrl
    expect(metadata.devServerUrl).toBeTruthy()
    expect(metadata.devServerUrl).toMatch(/^https?:\/\//)
    expect(metadata.devServerUrl).toContain('localhost')

    // The devServerUrl should match the next.url (base URL without path)
    const expectedBaseUrl = next.url
    expect(metadata.devServerUrl).toBe(expectedBaseUrl)
  })
})
