import http from 'node:http'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// `import.meta.glob` is Turbopack-only, and the fixture pins its canonical
// URL to localhost, so it cannot be deployed as-is.
// @force-gate turbopack && !deploy
describe('@next/mcp', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@next/mcp': 'workspace:*',
      zod: '4.6.7',
    },
  })

  const TOKEN = { authorization: 'Bearer test-token' }

  async function rpc(
    path: string,
    body: unknown,
    headers: Record<string, string> = {}
  ) {
    const res = await next.fetch(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
    const text = await res.text()
    return { res, json: parseBody(text) }
  }

  function parseBody(text: string): any {
    // Responses are JSON, or a single-event SSE stream for 2025-era clients.
    const data = text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
    try {
      return JSON.parse(data.length > 0 ? data[data.length - 1] : text)
    } catch {
      return text
    }
  }

  function callTool(
    name: string,
    args: unknown,
    headers: Record<string, string> = TOKEN
  ) {
    return rpc(
      '/mcp',
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name, arguments: args },
      },
      headers
    )
  }

  const listTools = { jsonrpc: '2.0', id: 1, method: 'tools/list' }

  it('serves tools collected with toolsFromGlob', async () => {
    const { res, json } = await rpc('/mcp', listTools, TOKEN)
    expect(res.status).toBe(200)
    const tools = json.result.tools
    expect(tools.map((tool: { name: string }) => tool.name).sort()).toEqual([
      'countdown',
      'delete_all',
      'explode',
      'roll_dice',
      'whoami',
    ])
    const rollDice = tools.find(
      (tool: { name: string }) => tool.name === 'roll_dice'
    )
    expect(rollDice.description).toBe('Roll an N-sided die.')
    expect(rollDice.inputSchema).toMatchObject({
      type: 'object',
      properties: { sides: { type: 'integer', minimum: 2, maximum: 1000 } },
      required: ['sides'],
    })
    expect(rollDice.outputSchema).toMatchObject({ type: 'object' })
  })

  it('reports serverInfo and instructions on initialize', async () => {
    const { json } = await rpc(
      '/mcp',
      {
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'e2e', version: '1' },
        },
      },
      TOKEN
    )
    expect(json.result.serverInfo).toEqual({
      name: 'next-mcp-e2e',
      version: '0.1.0',
    })
    expect(json.result.instructions).toBe('A test server.')
  })

  it('calls a tool and returns structured content', async () => {
    const { json } = await callTool('roll_dice', { sides: 6 })
    const { value } = json.result.structuredContent
    expect(value).toBeGreaterThanOrEqual(1)
    expect(value).toBeLessThanOrEqual(6)
    expect(JSON.parse(json.result.content[0].text)).toEqual({ value })
  })

  it('rejects invalid input with an invalid_input envelope', async () => {
    const { json } = await callTool('roll_dice', { sides: 1 })
    expect(json.result.isError).toBe(true)
    expect(json.result.structuredContent.error).toMatchObject({
      code: 'invalid_input',
      retryable: false,
    })
  })

  it('passes the verified identity, call id, and request context to tools', async () => {
    const { json } = await callTool('whoami', {})
    expect(json.result.structuredContent).toEqual({
      principal: {
        principalId: 'user-1',
        principalType: 'user',
        authenticator: 'test',
        attributes: { email: 'a@example.com' },
      },
      callId: '7',
      toolName: 'whoami',
    })
    // after() only works inside Next's request context.
    await retry(() => {
      expect(next.cliOutput).toContain('[next-mcp] after() ran for call 7')
    })
  })

  it('sanitizes errors thrown by tools', async () => {
    const { json } = await callTool('explode', {})
    expect(json.result.isError).toBe(true)
    const { error } = json.result.structuredContent
    expect(error).toEqual({
      code: 'internal',
      errorId: expect.stringMatching(/^[0-9A-Z]{10}$/),
      message: 'The server could not complete this tool call.',
      retryable: false,
    })
    expect(JSON.stringify(json)).not.toContain('hunter2')
    await retry(() => {
      expect(next.cliOutput).toContain(`(errorId: ${error.errorId})`)
    })
  })

  it('returns the final value of an async generator tool', async () => {
    const { json } = await callTool('countdown', { from: 3 })
    expect(json.result.content).toEqual([{ type: 'text', text: 't-0' }])
  })

  it('applies approval policies without running the tool', async () => {
    const denied = await callTool('delete_all', { really: false })
    expect(denied.json.result.structuredContent.error).toMatchObject({
      code: 'denied',
      message: 'Not really.',
    })
    const required = await callTool('delete_all', { really: true })
    expect(required.json.result.structuredContent.error).toMatchObject({
      code: 'approval_required',
    })
  })

  it('rejects a bad bearer token with 401', async () => {
    const { res } = await rpc('/mcp', listTools, {
      authorization: 'Bearer wrong',
    })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe(
      'Bearer error="invalid_token"'
    )
  })

  it('rejects a malformed Authorization header with 401', async () => {
    const { res } = await rpc('/mcp', listTools, {
      authorization: 'Bearer two tokens',
    })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe(
      'Bearer error="invalid_request"'
    )
  })

  if (isNextDev) {
    it('accepts local callers without credentials through localDev()', async () => {
      const { json } = await callTool('whoami', {}, {})
      expect(json.result.structuredContent.principal).toMatchObject({
        principalId: 'local-dev',
        authenticator: 'local-dev',
      })
    })
  } else {
    it('rejects callers without credentials in production, where localDev() skips', async () => {
      const { res } = await rpc('/mcp', listTools)
      expect(res.status).toBe(401)
      expect(res.headers.get('www-authenticate')).toBe('Bearer')
    })
  }

  it('rejects cross-origin browser requests before auth', async () => {
    const { res } = await rpc('/mcp', listTools, {
      ...TOKEN,
      origin: 'https://evil.example',
    })
    expect(res.status).toBe(403)
  })

  it('rejects the opaque null origin', async () => {
    const { res } = await rpc('/mcp', listTools, { ...TOKEN, origin: 'null' })
    expect(res.status).toBe(403)
  })

  it('rejects requests for a host other than the canonical one', async () => {
    // fetch() derives Host from the URL, so send the request with node:http.
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        new URL('/mcp', next.url),
        {
          method: 'POST',
          headers: {
            ...TOKEN,
            host: 'evil.example',
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
          },
        },
        (res) => {
          res.resume()
          resolve(res.statusCode!)
        }
      )
      req.on('error', reject)
      req.end(JSON.stringify(listTools))
    })
    expect(status).toBe(403)
  })

  it('rejects request bodies over 1 MiB', async () => {
    const { res } = await rpc('/mcp', 'a'.repeat(1024 * 1024 + 1), TOKEN)
    expect(res.status).toBe(413)
  })

  it('serves a public server anonymously under none()', async () => {
    const { json } = await rpc('/public-mcp', {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'whoami', arguments: {} },
    })
    expect(json.result.structuredContent.principal).toBeNull()
    expect(next.cliOutput).toContain(
      'mcpRoute("next-mcp-e2e-public") is a public MCP server'
    )
  })
})
