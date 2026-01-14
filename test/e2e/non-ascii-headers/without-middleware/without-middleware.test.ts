import { nextTestSetup } from 'e2e-utils'

/**
 * Test behavior of headers WITHOUT middleware.
 * See: https://github.com/vercel/next.js/pull/88237/files#r2677631301
 */

/**
 * Converts a UTF-8 string to its Mojibake representation.
 * This simulates what happens when UTF-8 bytes are interpreted as Latin-1.
 */
function toMojibake(str: string): string {
  const encoder = new TextEncoder() // UTF-8
  const bytes = encoder.encode(str)
  // Interpret UTF-8 bytes as Latin-1 characters
  return Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join('')
}

describe('Non-ASCII Headers Without Middleware', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should NOT decode mojibake headers without middleware', async () => {
    // Without middleware, mojibake recovery does NOT happen for Pages API routes.
    const res = await next.fetch('/api/headers', {
      headers: {
        'x-city': toMojibake('Montréal'),
        'x-country': toMojibake('Österreich'),
      },
    })

    expect(res.status).toBe(200)
    const headers = await res.json()
    // Without middleware, mojibake is NOT recovered - raw bytes pass through
    expect(headers['x-city']).toBe(toMojibake('Montréal'))
    expect(headers['x-country']).toBe(toMojibake('Österreich'))
  })

  it('should preserve intentional percent-encoding without middleware', async () => {
    const res = await next.fetch('/api/headers', {
      headers: {
        'x-path': '/hello%2Fworld',
        'x-query': 'foo%20bar',
      },
    })

    expect(res.status).toBe(200)
    const headers = await res.json()
    // Intentional percent-encoding should be preserved
    expect(headers['x-path']).toBe('/hello%2Fworld')
    expect(headers['x-query']).toBe('foo%20bar')
  })

  it('should pass through pure ASCII headers unchanged without middleware', async () => {
    const res = await next.fetch('/api/headers', {
      headers: {
        'x-simple': 'hello-world',
        'x-number': '12345',
      },
    })

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-simple']).toBe('hello-world')
    expect(headers['x-number']).toBe('12345')
  })

  describe('App Route Handler', () => {
    it('should decode mojibake headers in route handler', async () => {
      // App Route handlers decode mojibake even without middleware.
      // This is different from Pages API routes.
      const res = await next.fetch('/api/route-headers', {
        headers: {
          'x-city': toMojibake('Montréal'),
          'x-country': toMojibake('Österreich'),
        },
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body['x-city']).toBe('Montréal')
      expect(body['x-country']).toBe('Österreich')
    })

    it('should preserve intentional percent-encoding in route handler without middleware', async () => {
      const res = await next.fetch('/api/route-headers', {
        headers: {
          'x-path': '/hello%2Fworld',
          'x-query': 'foo%20bar',
        },
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body['x-path']).toBe('/hello%2Fworld')
      expect(body['x-query']).toBe('foo%20bar')
    })
  })
})
