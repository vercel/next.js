import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'
import { createTestDataServer } from 'test-data-service/writer'

async function callMcpTool(
  url: string,
  toolName: string,
  args: Record<string, unknown> = {}
) {
  const response = await fetch(`${url}/_next/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: toolName + '-' + Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  })
  const text = await response.text()
  const match = text.match(/data: ({.*})/s)
  expect(match).toBeTruthy()
  const envelope = JSON.parse(match![1])
  return JSON.parse(envelope.result?.content?.[0]?.text)
}

describe('mcp-server check_route tool', () => {
  let gate: ReturnType<typeof createTestDataServer>
  let holding = false
  const pending: Array<() => void> = []
  const { next } = nextTestSetup({
    skipStart: true,
    files: path.join(__dirname, 'fixtures', 'cache-components-app'),
  })

  beforeAll(async () => {
    const port = await findPort()
    gate = createTestDataServer((_, response) => {
      if (holding) pending.push(() => response.resolve())
      else response.resolve()
    })
    gate.listen(port)
    next.env.TEST_GATE_URL = `http://localhost:${port}/?key=overlap`
    await next.start()
  })

  afterAll(() => gate?.close())

  it('reports a blocking route without a browser', async () => {
    const result = await callMcpTool(next.url, 'check_route', {
      path: '/blocking',
    })

    expect(result).toMatchObject({
      path: '/blocking',
      httpStatus: 200,
      ok: false,
      validation: { status: 'validated' },
    })
    expect(result.validation.errors).toHaveLength(1)
    const [error] = result.validation.errors
    expect(error.message).toContain(
      'Next.js encountered uncached data during prerendering'
    )
    expect(error.location).toBe('app/blocking/page.tsx:4:19')
    expect(error.stack).toContain('at Page (app/blocking/page.tsx:4:19)')
    expect(error.stack).toContain('> 4 |   await connection()')
  })

  it('passes a route that streams its request-time data', async () => {
    const result = await callMcpTool(next.url, 'check_route', {
      path: '/streaming',
    })

    expect(result).toMatchObject({
      path: '/streaming',
      httpStatus: 200,
      ok: true,
      validation: { status: 'validated', errors: [] },
    })
  })

  it('passes a static route', async () => {
    const result = await callMcpTool(next.url, 'check_route', { path: '/' })

    expect(result).toMatchObject({
      ok: true,
      validation: { status: 'validated', errors: [] },
    })
  })

  it('still reports the blocking route after a request that bypassed server caches', async () => {
    // A hard refresh, "Disable cache" in DevTools, and an automated browser
    // with request interception enabled all send this header. Validation is
    // skipped for that request, so nothing is reported for it.
    await next.fetch('/blocking', {
      headers: { 'cache-control': 'no-cache' },
    })

    const result = await callMcpTool(next.url, 'check_route', {
      path: '/blocking',
    })

    expect(result.ok).toBe(false)
    expect(result.validation.status).toBe('validated')
    expect(result.validation.errors[0].message).toContain(
      'Next.js encountered uncached data during prerendering'
    )
    expect(result.validation.errors[0].location).toBe(
      'app/blocking/page.tsx:4:19'
    )
  })

  it('ignores a skipped validation from a concurrent request to the same URL', async () => {
    holding = true
    const check = callMcpTool(next.url, 'check_route', { path: '/overlap' })
    try {
      // Hold the tool's HTML render until the other request has finished.
      await retry(() => expect(pending.length).toBeGreaterThan(0), 60_000, 100)
      const bypassed = await next.fetch('/overlap', {
        headers: { 'cache-control': 'no-cache' },
      })
      expect(await bypassed.text()).toContain('Bypassed')
    } finally {
      holding = false
      for (const release of pending.splice(0)) release()
    }
    const result = await check
    expect(result).toMatchObject({
      httpStatus: 200,
      ok: false,
      validation: { status: 'validated' },
    })
    expect(result.validation.errors.length).toBeGreaterThan(0)
  })

  it('reports invalid dynamic usage even when the page catches the error', async () => {
    const result = await callMcpTool(next.url, 'check_route', {
      path: '/caught',
    })
    expect(result).toMatchObject({
      httpStatus: 200,
      ok: false,
      validation: {
        status: 'validated',
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('cookies'),
            stack: expect.stringContaining('app/caught/page.tsx'),
          }),
        ]),
      },
    })
  })

  it('does not pass a redirect or validate its destination', async () => {
    const result = await callMcpTool(next.url, 'check_route', {
      path: '/redirect',
    })
    expect(result).toMatchObject({
      httpStatus: 307,
      ok: false,
      validation: {
        status: 'not-run',
        reason: expect.stringContaining('/streaming'),
      },
    })
  })

  it('rejects a path that is not site-relative', async () => {
    const result = await callMcpTool(next.url, 'check_route', {
      path: 'https://example.com/',
    })

    expect(result.error).toBe('Provide a path that starts with a single "/".')
  })

  it('rejects a path that resolves to another origin', async () => {
    const result = await callMcpTool(next.url, 'check_route', {
      path: '/\\\\example.com/',
    })

    expect(result.error).toBe('Provide a path that starts with a single "/".')
  })
})
