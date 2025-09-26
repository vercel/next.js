import { nextTestSetup } from 'e2e-utils'

describe('options-request', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each(['/app-page/dynamic', '/pages-page/dynamic'])(
    'should return a 400 status code when invoking %s with an OPTIONS request (dynamic rendering)',
    async (path) => {
      const res = await next.fetch(path, { method: 'OPTIONS' })
      expect(res.status).toBe(400)
      // There should be no response body
      expect(await res.text()).toBe('')
    }
  )

  it.each(['/app-page/static', '/pages-page/static'])(
    'should return a 405 status code when invoking %s with an OPTIONS request (static rendering)',
    async (path) => {
      const res = await next.fetch(path, { method: 'OPTIONS' })
      expect(res.status).toBe(405)
      expect(await res.text()).toBe('Method Not Allowed')
    }
  )

  // In app router, OPTIONS is auto-implemented if not provided
  it('should respond with a 204 No Content when invoking an app route handler with an OPTIONS request', async () => {
    const res = await next.fetch('/app-route', { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    // There should be no response body
    expect(await res.text()).toBe('')
  })

  // In pages router, unless the handler explicitly handles OPTIONS, it will handle the request normally
  it('should respond with a 200 + response body when invoking a pages API route with an OPTIONS request', async () => {
    const res = await next.fetch('/api/pages-api-handler', {
      method: 'OPTIONS',
    })
    expect(res.status).toBe(200)
    // There should be no response body
    expect((await res.json()).message).toBe('Hello from Next.js!')
  })

  it('should 404 for an OPTIONS request to a non-existent route', async () => {
    const res = await next.fetch('/non-existent-route', { method: 'OPTIONS' })
    expect(res.status).toBe(404)
  })
})
