import { nextTestSetup } from 'e2e-utils'

describe('route-handler-request-copy', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each([
    { method: 'POST', copy: 'new Request(request)' },
    { method: 'PUT', copy: 'new NextRequest(request)' },
  ])('should read the request from $copy', async ({ method }) => {
    const res = await next.fetch('/copy?query=1', {
      method,
      headers: { 'x-test': 'header' },
      body: 'body',
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      isProxy: false,
      request: { header: 'header', search: '?query=1' },
      copy: { header: 'header', body: 'body' },
    })
  })

  it('should copy the request in a handler that reads no request data', async () => {
    const res = await next.fetch('/static')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ isProxy: false, method: 'GET' })
  })
})
