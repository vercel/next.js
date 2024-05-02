import { nextTestSetup } from 'e2e-utils'

describe('options-request', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each(['/app-page', '/pages-page'])(
    'should return a 400 status code when invoking %s with an OPTIONS request',
    async (path) => {
      const res = await next.fetch(path, { method: 'OPTIONS' })
      expect(res.status).toBe(400)
      // There should be no response body
      expect(await res.text()).toBe('')
    }
  )

  // In app router, OPTIONS is auto-implemented if not provided
  it('should respond with a 204 No Content when invoking an app route handler with an OPTIONS request', async () => {
    const res = await next.fetch('/app-route', { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    // There should be no response body
    expect(await res.text()).toBe('')
  })

  it('should 404 for an OPTIONS request to a non-existent route', async () => {
    const res = await next.fetch('/non-existent-route', { method: 'OPTIONS' })
    expect(res.status).toBe(404)
  })
})
