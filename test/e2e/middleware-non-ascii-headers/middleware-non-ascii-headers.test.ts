import { join } from 'path'
import { NextInstance } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'

/**
 *
 * When middleware forwards headers containing non-ASCII values
 * (e.g. x-city: "Montréal"), the request fails because x-middleware-request-* headers
 * must be ASCII-safe per HTTP spec.
 *
 * IMPORTANT: In real-world scenarios, UTF-8 header values are
 * transmitted as bytes and interpreted by Node.js as Latin-1, causing "Mojibake".
 * For example, "Montréal" (UTF-8: 4D 6F 6E 74 72 C3 A9 61 6C) arrives as "MontrÃ©al" when those UTF-8 bytes are interpreted as Latin-1 characters.
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
    // Simulate what the server receives when sends "Montréal" as UTF-8
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

  // Test for LOCAL scenario: when headers are sent as proper Latin-1 (not Mojibake)
  // This happens when:
  // - A local proxy (nginx, etc.) adds headers with non-ASCII
  // - Node.js fetch/http client sends headers (converts to Latin-1)
  // Unlike CDN scenario, these arrive as single-byte Latin-1, not UTF-8 Mojibake
  it('should handle Latin-1 encoded headers (local proxy scenario)', async () => {
    // When fetchViaHTTP sends "Montréal", it encodes as Latin-1:
    // "é" becomes single byte 0xE9 (not UTF-8's 0xC3 0xA9)
    // This simulates a local proxy adding headers
    const res = await fetchViaHTTP(
      next.url,
      '/api/headers',
      {},
      {
        headers: {
          'x-city': 'Montréal', // Latin-1: é = 0xE9
          'x-region': 'Île-de-France',
          'x-country': 'Österreich',
        },
      }
    )

    expect(res.status).toBe(200)
    const headers = await res.json()
    // These should be preserved correctly through middleware
    expect(headers['x-city']).toBe('Montréal')
    expect(headers['x-region']).toBe('Île-de-France')
    expect(headers['x-country']).toBe('Österreich')
  })
})
