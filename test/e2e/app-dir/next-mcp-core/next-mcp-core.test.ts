import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('@next/mcp core', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
    dependencies: { '@next/mcp': 'workspace:*' },
    // Next.js synthesizes request.url using this listening hostname. Requests
    // still arrive with a loopback Host, which localDev() must recognize.
    startArgs: ['--hostname', '0.0.0.0'],
  })

  async function rpc(method: string, params: object = {}, path = '/mcp') {
    const res = await next.fetch(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    })
    const text = await res.text()
    const event = text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .pop()
    try {
      return {
        res,
        json: JSON.parse(event === undefined ? text : event.slice(5).trim()),
      }
    } catch {
      throw new Error(`Invalid MCP response (${res.status}): ${text}`)
    }
  }

  const callTool = (name: string, args: object = {}) =>
    rpc('tools/call', { name, arguments: args })

  it('advertises the schemas still enforced by the wrapper', async () => {
    const { res, json } = await rpc('tools/list')
    expect(res.status).toBe(200)
    expect(json.result.tools).toContainEqual(
      expect.objectContaining({
        name: 'valid_output',
        inputSchema: expect.objectContaining({ type: 'object' }),
        outputSchema: expect.objectContaining({
          type: 'object',
          properties: { value: { type: 'integer' } },
          required: ['value'],
        }),
      })
    )
  })

  it('returns valid structured output', async () => {
    const { res, json } = await callTool('valid_output')
    expect(res.status).toBe(200)
    expect(json.result.isError).not.toBe(true)
    expect(json.result.structuredContent).toEqual({ value: 42 })
    expect(JSON.parse(json.result.content[0].text)).toEqual({ value: 42 })
  })

  it.each(['invalid_output', 'throwing_validator', 'async_invalid_output'])(
    'sanitizes %s as an internal error',
    async (name) => {
      const { res, json } = await callTool(name)
      expect(res.status).toBe(200)
      const { error } = json.result.structuredContent
      expect(error).toEqual({
        code: 'internal',
        errorId: expect.stringMatching(/^[0-9A-Z]{10}$/),
        message: 'The server could not complete this tool call.',
        retryable: false,
      })
      expect(json.result.isError).toBe(true)
      expect(json.result.content).toEqual([
        {
          type: 'text',
          text: `${error.message} (errorId: ${error.errorId})`,
        },
      ])
      expect(JSON.stringify(json)).not.toContain('private validator detail')
      expect(JSON.stringify(json)).not.toContain('private validation issue')
      expect(JSON.stringify(json)).not.toContain('not an integer')
      // Only the local harness exposes server console output. The error
      // envelope and correlation ID above are also asserted in deploy mode.
      if (!isNextDeploy) {
        await retry(() => {
          expect(next.cliOutput).toContain(`(errorId: ${error.errorId})`)
        })
      }
    }
  )

  it('retains the invalid_input envelope for invalid arguments', async () => {
    const { json } = await callTool('valid_output', { unexpected: true })
    expect(json.result.isError).toBe(true)
    expect(json.result.structuredContent.error.code).toBe('invalid_input')
  })

  it('does not validate denied calls against the success output schema', async () => {
    const { json } = await callTool('denied')
    expect(json.result.isError).toBe(true)
    expect(json.result.structuredContent.error.code).toBe('denied')
    expect(JSON.stringify(json)).not.toContain('must not execute')
  })

  it('returns the final yield rather than a generator return value', async () => {
    const { json } = await callTool('final_yield')
    expect(json.result.content).toEqual([{ type: 'text', text: 'last yield' }])
  })

  it('preserves SDK-reserved names in globs and rejects them at route setup', async () => {
    const { names, errors } = await next
      .fetch('/reserved-names')
      .then((res) => res.json())
    expect(names).toEqual(['__proto__', 'constructor', 'toString'])
    expect(errors).toHaveLength(names.length)
    for (const error of errors) {
      expect(error).toContain('uses a name reserved by the MCP SDK')
    }
  })

  it('allows local callers with a wildcard binding only under next dev', async () => {
    const { res, json } = await rpc('tools/list', {}, '/local-dev')
    if (isNextDev) {
      expect(res.status).toBe(200)
      expect(json.result.tools).toEqual([])
    } else {
      // Includes deployed production, where localDev() must never admit callers.
      expect(res.status).toBe(401)
      expect(res.headers.get('www-authenticate')).toBe('Bearer')
    }
  })
})
