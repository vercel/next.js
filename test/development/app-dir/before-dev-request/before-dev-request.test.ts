import { nextTestSetup } from 'e2e-utils'

describe('experimental.beforeDevRequest', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('short-circuits when the hook sends a response', async () => {
    const res = await next.fetch('/intercepted')
    expect(res.status).toBe(418)
    expect(res.headers.get('x-before-dev-request')).toBe('hit')
    expect(await res.text()).toBe('intercepted by beforeDevRequest')
  })

  it('receives the real Node req/res (url + request headers)', async () => {
    const res = await next.fetch('/intercepted', {
      headers: { 'x-custom': 'from-test' },
    })
    expect(res.headers.get('x-seen-url')).toBe('/intercepted')
    expect(res.headers.get('x-seen-custom')).toBe('from-test')
  })

  it('supports async hooks (awaits before responding)', async () => {
    const res = await next.fetch('/intercepted-async')
    expect(res.status).toBe(418)
    expect(await res.text()).toContain('intercepted by beforeDevRequest')
  })

  it('passes through when the hook does not respond', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello world')
  })

  it('runs before rewrites (intercepts even when a rewrite matches the path)', async () => {
    // `/intercepted` has a rewrite to `/rewrite-target`, but the hook runs at
    // the middleware point (before rewrites), so it should still short-circuit
    // and still see the original `/intercepted` URL.
    const res = await next.fetch('/intercepted')
    expect(res.status).toBe(418)
    expect(res.headers.get('x-seen-url')).toBe('/intercepted')
    expect(await res.text()).toBe('intercepted by beforeDevRequest')
  })

  it('lets rewrites apply when the hook does not respond', async () => {
    const res = await next.fetch('/rewrite-passthrough')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('rewrite target')
  })
})
