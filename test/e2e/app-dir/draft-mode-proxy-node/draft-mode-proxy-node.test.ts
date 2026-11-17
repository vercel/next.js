import { nextTestSetup } from 'e2e-utils'

// Proxy runs on the Node.js runtime. Draft mode there must use the same
// preview props as the rest of the app, like it does on the Edge runtime.
// https://github.com/vercel/next.js/issues/82344
describe('draft mode in proxy (Node.js runtime)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function getBypassCookie() {
    const res = await next.fetch('/enable')
    expect(res.status).toBe(200)
    const cookie = (res.headers.get('set-cookie') || '')
      .split(';')
      .find((c) => c.startsWith('__prerender_bypass='))
    expect(cookie).toBeDefined()
    return cookie!
  }

  it('reports draft mode as disabled without the bypass cookie', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-draft-mode')).toBe('disabled')
  })

  it('reports draft mode as enabled with a valid bypass cookie', async () => {
    const cookie = await getBypassCookie()
    const res = await next.fetch('/', { headers: { cookie } })
    expect(res.status).toBe(200)
    expect(res.headers.get('x-draft-mode')).toBe('enabled')
  })

  it('can enable draft mode from proxy', async () => {
    const res = await next.fetch('/?draft=true')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-draft-mode')).toBe('enabled')
    expect(res.headers.get('set-cookie')).toContain('__prerender_bypass=')
  })

  it('sets a bypass cookie from proxy that the app accepts', async () => {
    const res = await next.fetch('/?draft=true')
    const cookie = (res.headers.get('set-cookie') || '')
      .split(';')
      .find((c) => c.startsWith('__prerender_bypass='))
    expect(cookie).toBeDefined()

    const followUp = await next.fetch('/', { headers: { cookie: cookie! } })
    expect(followUp.headers.get('x-draft-mode')).toBe('enabled')
  })
})
