import { nextTestSetup } from 'e2e-utils'

// R28: route-handlers.mdx, "Caching": GET is uncached by default and can
// opt in; other methods remain uncached even beside a cached GET.
describe('documented Route Handler caching by method', () => {
  const { next, isNextDev } = nextTestSetup({ files: __dirname })

  async function invoke(path: string, method = 'GET') {
    const response = await next.fetch(path, { method })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.method).toBe(method)
    expect(body.invocation).toMatch(/^[a-f0-9-]{36}$/)
    return body.invocation as string
  }

  it('does not cache a default GET response', async () => {
    expect(await invoke('/default')).not.toBe(await invoke('/default'))
  })

  it.each(['/static-only', '/cached'])(
    'caches an opted-in GET at %s in production while keeping development fresh',
    async (path) => {
      const first = await invoke(path)
      const second = await invoke(path)
      if (isNextDev) expect(second).not.toBe(first)
      else expect(second).toBe(first)
    }
  )

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'does not cache %s beside the opted-in GET',
    async (method) => {
      const first = await invoke('/cached', method)
      expect(await invoke('/cached', method)).not.toBe(first)
    }
  )

  it('does not cache an explicit HEAD beside the opted-in GET', async () => {
    const first = await next.fetch('/cached', { method: 'HEAD' })
    const second = await next.fetch('/cached', { method: 'HEAD' })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(await first.text()).toBe('')
    expect(await second.text()).toBe('')
    const invocation = first.headers.get('x-invocation')
    expect(invocation).toMatch(/^[a-f0-9-]{36}$/)
    expect(second.headers.get('x-invocation')).toMatch(/^[a-f0-9-]{36}$/)
    expect(second.headers.get('x-invocation')).not.toBe(invocation)
  })
})
