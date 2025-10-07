import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import fs from 'fs/promises'
import { getDistDir } from 'next-test-utils'

describe('mcp-server get_server_action_by_id tool', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'actions-app')),
  })

  it('should return action details via get_server_action_by_id tool', async () => {
    const mcpEndpoint = `${next.url}/_next/mcp`

    // Visit the page to trigger action registration
    await next.render('/')

    // Read the manifest to get a valid action ID
    const manifestPath = path.join(
      next.testDir,
      getDistDir(),
      'server',
      'server-reference-manifest.json'
    )
    const manifestContent = await fs.readFile(manifestPath, 'utf-8')
    const manifest = JSON.parse(manifestContent)

    // Get the first action ID from the manifest
    const actionId = Object.keys(manifest.node || {})[0]
    expect(actionId).toBeTruthy()

    // Call get_server_action_by_id tool
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
          name: 'get_server_action_by_id',
          arguments: {
            actionId,
          },
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

    const actionDetails = JSON.parse(content?.[0]?.text)

    // Verify the action details
    expect(actionDetails.actionId).toBe(actionId)
    expect(actionDetails.runtime).toBe('node')
    expect(actionDetails.filename).toContain('app/actions.ts')
    expect(actionDetails.functionName).toBeTruthy()
  })

  it('should return error for non-existent action ID', async () => {
    const mcpEndpoint = `${next.url}/_next/mcp`

    // Call get_server_action_by_id tool with non-existent ID
    const callToolResponse = await fetch(mcpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'call-tool-2',
        method: 'tools/call',
        params: {
          name: 'get_server_action_by_id',
          arguments: {
            actionId: 'non-existent-id-12345',
          },
        },
      }),
    })

    const callToolText = await callToolResponse.text()
    const callToolDataMatch = callToolText.match(/data: ({.*})/s)
    expect(callToolDataMatch).toBeTruthy()

    const callToolResult = JSON.parse(callToolDataMatch![1])
    expect(callToolResult.jsonrpc).toBe('2.0')
    expect(callToolResult.id).toBe('call-tool-2')

    const content = callToolResult.result?.content
    expect(content).toBeInstanceOf(Array)
    expect(content?.[0]?.type).toBe('text')
    expect(content?.[0]?.text).toContain('not found')
  })

  it('should return inline server action details', async () => {
    const mcpEndpoint = `${next.url}/_next/mcp`

    // Visit the page to trigger action registration
    await next.render('/inline')

    // Read the manifest to get inline action ID
    const manifestPath = path.join(
      next.testDir,
      getDistDir(),
      'server',
      'server-reference-manifest.json'
    )
    const manifestContent = await fs.readFile(manifestPath, 'utf-8')
    const manifest = JSON.parse(manifestContent)

    // Find the inline action ID (inline actions defined in server components)
    const inlineActionId = Object.keys(manifest.node || {}).find((id) => {
      const action = manifest.node[id]
      return (
        action.filename === 'app/inline/page.tsx' &&
        action.exportedName?.startsWith('$$RSC_SERVER_ACTION_')
      )
    })
    expect(inlineActionId).toBeTruthy()

    // Call get_server_action_by_id tool for inline action
    const callToolResponse = await fetch(mcpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'call-tool-3',
        method: 'tools/call',
        params: {
          name: 'get_server_action_by_id',
          arguments: {
            actionId: inlineActionId,
          },
        },
      }),
    })

    const callToolText = await callToolResponse.text()
    const callToolDataMatch = callToolText.match(/data: ({.*})/s)
    expect(callToolDataMatch).toBeTruthy()

    const callToolResult = JSON.parse(callToolDataMatch![1])
    expect(callToolResult.jsonrpc).toBe('2.0')
    expect(callToolResult.id).toBe('call-tool-3')

    const content = callToolResult.result?.content
    expect(content).toBeInstanceOf(Array)
    expect(content?.[0]?.type).toBe('text')

    const actionDetails = JSON.parse(content?.[0]?.text)

    // Verify the inline action details
    expect(actionDetails.actionId).toBe(inlineActionId)
    expect(actionDetails.runtime).toBe('node')
    expect(actionDetails.filename).toBeTruthy()
    expect(actionDetails.functionName).toBe('inline server action')
  })
})
