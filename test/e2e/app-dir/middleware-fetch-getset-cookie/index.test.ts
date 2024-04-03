import { nextTestSetup } from 'e2e-utils'

describe('middleware-fetch-getset-cookie', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    forcedPort: '7777',
  })

  it('should have getSetCookie is array', async () => {
    const res = await next.fetch('/set-cookie')
    expect(res.status).toBe(200)
    const html = await res.json()
    expect(Array.isArray(html.setCookies)).toBe(true)
    expect(html.setCookies).toEqual(['foo=foo', 'bar=bar'])
  })

  it('should have middleware getSetCookie', async () => {
    const res = await next.fetch('/')
    expect(res.status).not.toBe(500)
    expect(res.status).toBe(200)
  })
})
