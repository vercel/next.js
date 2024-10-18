import { nextTestSetup } from 'e2e-utils'

describe('fetch-get-set-cookie', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    forcedPort: '7777',
  })

  it('should set cookies retrievable by getSetCookie in route handler', async () => {
    const res = await next.fetch('/set-cookies')
    expect(res.status).toBe(200)
    const html = await res.json()
    expect(Array.isArray(html.setCookies)).toBe(true)
    expect(html.setCookies).toEqual(['foo=foo', 'bar=bar'])
  })

  it('should fetch and getSetCookie properly on middleware', async () => {
    const res = await next.fetch('/')
    // status 500 if getSetCookie length <= 1
    expect(res.status).toBe(200)
  })
})
