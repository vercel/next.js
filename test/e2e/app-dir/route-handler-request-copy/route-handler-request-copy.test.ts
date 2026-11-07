import { nextTestSetup } from 'e2e-utils'

describe('route-handler-request-copy', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  const request = { header: 'header', search: '?query=1' }

  describe.each([
    { path: '/default', request },
    { path: '/force-dynamic', request },
    { path: '/error', request },
    { path: '/edge', request },
    // The request that the route handler receives has no request data.
    { path: '/force-static', request: { header: null, search: '' } },
  ])('$path', ({ path, request: expected }) => {
    it.each([
      { method: 'POST', copy: 'new Request(request)' },
      { method: 'PUT', copy: 'new NextRequest(request)' },
    ])('should read the request from $copy', async ({ method }) => {
      const res = await next.fetch(path + '?query=1', {
        method,
        headers: { 'x-test': 'header' },
        body: 'body',
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        request: expected,
        copy: { header: 'header', body: 'body' },
      })
    })
  })

  it('should keep the request static with dynamic = "force-static"', async () => {
    const res = await next.fetch('/force-static/1?query=1', {
      headers: { 'x-test': 'header' },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      method: 'GET GET',
      header: null,
      search: '',
    })
  })

  it('should keep the request static with dynamic = "error"', async () => {
    const res = await next.fetch('/error/1?query=1', {
      headers: { 'x-test': 'header' },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      method: 'GET GET',
      // The development server does not prerender the route.
      error: isNextDev
        ? null
        : expect.stringContaining(
            "couldn't be rendered statically because it used `request.headers`"
          ),
    })
  })

  it('should read form data with dynamic = "force-static"', async () => {
    const body = new FormData()
    body.set('field', 'value')
    const res = await next.fetch('/force-static/form', { method: 'POST', body })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ field: 'value', header: null })
  })
})
