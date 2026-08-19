import { nextTestSetup } from 'e2e-utils'

describe('agent-mode', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      // `force` enables experimental agent mode and bypasses AI-agent
      // detection so the test doesn't depend on the environment it runs in.
      __NEXT_EXPERIMENTAL_AGENT_MODE: 'force',
    },
  })

  it('should intercept curl fetches of app routes with structured guidance', async () => {
    const res = await next.fetch('/', {
      headers: { 'user-agent': 'curl/8.7.1' },
    })
    expect(res.status).toBe(403)
    expect(res.headers.get('x-nextjs-agent-mode')).toBe('1')
    const body = await res.json()
    expect(body.blocked).toBe(true)
    expect(body.instead.mcp).toContain('/_next/mcp')
    expect(body.instead.index).toContain('/_next/agent')
    expect(body.escapeHatch).toContain('x-nextjs-agent')
  })

  it('should intercept wget fetches of app routes', async () => {
    const res = await next.fetch('/', {
      headers: { 'user-agent': 'Wget/1.21.4' },
    })
    expect(res.status).toBe(403)
  })

  it('should serve the route when the escape-hatch header is sent', async () => {
    const res = await next.fetch('/', {
      headers: { 'user-agent': 'curl/8.7.1', 'x-nextjs-agent': 'raw' },
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello world')
  })

  it('should not intercept non-CLI user agents', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello world')
  })

  it('should serve a machine-readable index at /_next/agent', async () => {
    const res = await next.fetch('/_next/agent', {
      headers: { 'user-agent': 'curl/8.7.1' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.agentMode).toBe(true)
    expect(typeof body.project).toBe('string')
    expect(body.mcp.url).toContain('/_next/mcp')
    expect(body.mcp.tools).toContain('get_errors')
    expect(body.mcp.tools).toContain('get_routes')
  })
})
