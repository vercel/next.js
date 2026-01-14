import { nextTestSetup } from 'e2e-utils'

/**
 * When middleware forwards headers containing non-ASCII values
 * (e.g. x-city: "Montréal"), the request fails because x-middleware-request-* headers
 * must be ASCII-safe per HTTP spec.
 *
 * IMPORTANT: In real-world scenarios, UTF-8 header values are
 * transmitted as bytes and interpreted by Node.js as Latin-1, causing "Mojibake".
 * For example, "Montréal" (UTF-8: 4D 6F 6E 74 72 C3 A9 61 6C) arrives as "MontrÃ©al"
 * when those UTF-8 bytes are interpreted as Latin-1 characters.
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

describe('Non-ASCII Headers With Middleware', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should handle headers with French accented characters (Montréal)', async () => {
    // Simulate what the server receives when sends "Montréal" as UTF-8
    // The UTF-8 bytes get interpreted as Latin-1, producing "MontrÃ©al"
    const res = await next.fetch('/api/headers', {
      headers: {
        'x-city': toMojibake('Montréal'),
      },
    })

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-city']).toBe('Montréal')
  })

  it('should handle headers with German umlauts (München)', async () => {
    const res = await next.fetch('/api/headers', {
      headers: {
        'x-city': toMojibake('München'),
      },
    })

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-city']).toBe('München')
  })

  it('should handle headers with Spanish characters (España)', async () => {
    const res = await next.fetch('/api/headers', {
      headers: {
        'x-country': toMojibake('España'),
      },
    })

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-country']).toBe('España')
  })

  it('should handle headers with Nordic characters (Malmö, København)', async () => {
    const res = await next.fetch('/api/headers', {
      headers: {
        'x-city': toMojibake('Malmö'),
        'x-region': toMojibake('København'),
      },
    })

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-city']).toBe('Malmö')
    expect(headers['x-region']).toBe('København')
  })

  it('should handle headers with French region names (Île-de-France)', async () => {
    const res = await next.fetch('/api/headers', {
      headers: {
        'x-region': toMojibake('Île-de-France'),
      },
    })

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-region']).toBe('Île-de-France')
  })

  it('should handle headers with Austrian characters (Österreich)', async () => {
    const res = await next.fetch('/api/headers', {
      headers: {
        'x-country': toMojibake('Österreich'),
      },
    })

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-country']).toBe('Österreich')
  })

  it('should handle multiple headers with various non-ASCII characters', async () => {
    const res = await next.fetch('/api/headers', {
      headers: {
        'x-city': toMojibake('Montréal'),
        'x-region': toMojibake('Île-de-France'),
        'x-country': toMojibake('Österreich'),
        'x-greeting': toMojibake('Grüß Gott'),
      },
    })

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-city']).toBe('Montréal')
    expect(headers['x-region']).toBe('Île-de-France')
    expect(headers['x-country']).toBe('Österreich')
    expect(headers['x-greeting']).toBe('Grüß Gott')
  })

  it('should handle headers with Portuguese characters (São Paulo)', async () => {
    const res = await next.fetch('/api/headers', {
      headers: {
        'x-city': toMojibake('São Paulo'),
      },
    })

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-city']).toBe('São Paulo')
  })

  it('should preserve intentional percent-encoding in ASCII headers', async () => {
    const res = await next.fetch('/api/headers', {
      headers: {
        // These are intentionally percent-encoded ASCII values
        // They should NOT be decoded to spaces/slashes
        'x-path': '/hello%2Fworld', // %2F = encoded slash
        'x-query': 'foo%20bar', // %20 = encoded space
        'x-mixed': 'test%26value', // %26 = encoded ampersand
      },
    })

    expect(res.status).toBe(200)
    const headers = await res.json()
    // Intentional percent-encoding should be preserved
    expect(headers['x-path']).toBe('/hello%2Fworld')
    expect(headers['x-query']).toBe('foo%20bar')
    expect(headers['x-mixed']).toBe('test%26value')
  })

  it('should pass through pure ASCII headers unchanged', async () => {
    const res = await next.fetch('/api/headers', {
      headers: {
        'x-simple': 'hello-world',
        'x-number': '12345',
        'x-special': 'test_value-123',
      },
    })

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-simple']).toBe('hello-world')
    expect(headers['x-number']).toBe('12345')
    expect(headers['x-special']).toBe('test_value-123')
  })

  describe('App Route Handler', () => {
    it('should read non-ASCII request headers correctly in route handler', async () => {
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

    it('should preserve intentional percent-encoding in route handler', async () => {
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
