import { join } from 'path'
import { NextInstance } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'

/**
 * Test for issue #85631: Middleware crashes when processing headers with non-ASCII characters.
 *
 * When middleware forwards headers containing non-ASCII values (e.g., Cloudflare's
 * cf-ipcity: "Montréal"), the request fails because x-middleware-request-* headers
 * must be ASCII-safe per HTTP spec.
 *
 * IMPORTANT: In real-world scenarios (Cloudflare, browsers), UTF-8 header values are
 * transmitted as bytes and interpreted by Node.js as Latin-1, causing "Mojibake".
 * For example, "Montréal" (UTF-8: 4D 6F 6E 74 72 C3 A9 61 6C) arrives as "MontrÃ©al"
 * when those UTF-8 bytes are interpreted as Latin-1 characters.
 *
 * node-fetch (used in tests) handles headers differently - it converts non-ASCII to
 * replacement characters. So these tests send the Mojibake directly to simulate
 * what the server actually receives in production.
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

describe('Middleware Non-ASCII Headers', () => {
  let next: NextInstance

  afterAll(() => next.destroy())
  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'app/pages')),
        'next.config.js': new FileRef(join(__dirname, 'app/next.config.js')),
        'middleware.js': new FileRef(join(__dirname, 'app/middleware.js')),
      },
    })
  })

  it('should handle headers with French accented characters (Montréal)', async () => {
    // Simulate what the server receives when Cloudflare sends "Montréal" as UTF-8
    // The UTF-8 bytes get interpreted as Latin-1, producing "MontrÃ©al"
    const res = await fetchViaHTTP(
      next.url,
      '/api/headers',
      {},
      {
        headers: {
          'x-city': toMojibake('Montréal'),
        },
      }
    )

    expect(res.status).toBe(200)
    const headers = await res.json()
    // The middleware should recover the original UTF-8 string
    expect(headers['x-city']).toBe('Montréal')
  })

  it('should handle headers with German umlauts (München)', async () => {
    const res = await fetchViaHTTP(
      next.url,
      '/api/headers',
      {},
      {
        headers: {
          'x-city': toMojibake('München'),
        },
      }
    )

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-city']).toBe('München')
  })

  it('should handle headers with Spanish characters (España)', async () => {
    const res = await fetchViaHTTP(
      next.url,
      '/api/headers',
      {},
      {
        headers: {
          'x-country': toMojibake('España'),
        },
      }
    )

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-country']).toBe('España')
  })

  it('should handle headers with Nordic characters (Malmö, København)', async () => {
    const res = await fetchViaHTTP(
      next.url,
      '/api/headers',
      {},
      {
        headers: {
          'x-city': toMojibake('Malmö'),
          'x-region': toMojibake('København'),
        },
      }
    )

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-city']).toBe('Malmö')
    expect(headers['x-region']).toBe('København')
  })

  it('should handle headers with French region names (Île-de-France)', async () => {
    const res = await fetchViaHTTP(
      next.url,
      '/api/headers',
      {},
      {
        headers: {
          'x-region': toMojibake('Île-de-France'),
        },
      }
    )

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-region']).toBe('Île-de-France')
  })

  it('should handle headers with Austrian characters (Österreich)', async () => {
    const res = await fetchViaHTTP(
      next.url,
      '/api/headers',
      {},
      {
        headers: {
          'x-country': toMojibake('Österreich'),
        },
      }
    )

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-country']).toBe('Österreich')
  })

  it('should handle multiple headers with various non-ASCII characters', async () => {
    const res = await fetchViaHTTP(
      next.url,
      '/api/headers',
      {},
      {
        headers: {
          'x-city': toMojibake('Montréal'),
          'x-region': toMojibake('Île-de-France'),
          'x-country': toMojibake('Österreich'),
          'x-greeting': toMojibake('Grüß Gott'),
        },
      }
    )

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-city']).toBe('Montréal')
    expect(headers['x-region']).toBe('Île-de-France')
    expect(headers['x-country']).toBe('Österreich')
    expect(headers['x-greeting']).toBe('Grüß Gott')
  })

  it('should handle headers with Portuguese characters (São Paulo)', async () => {
    const res = await fetchViaHTTP(
      next.url,
      '/api/headers',
      {},
      {
        headers: {
          'x-city': toMojibake('São Paulo'),
        },
      }
    )

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-city']).toBe('São Paulo')
  })
})
