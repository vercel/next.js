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
 * Error: "Header 'x-middleware-request-cf-ipcity: Montréal' contains non-ASCII characters"
 *
 * Note: HTTP headers can only contain ISO-8859-1 (Latin-1) characters (char codes 0-255).
 * Characters outside this range cannot be sent via HTTP headers at all.
 * The issue specifically affects Latin-1 characters like French accents (é, è, ê),
 * German umlauts (ü, ö, ä), and other Western European characters.
 */
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
    // This is the exact scenario from issue #85631 - Cloudflare's cf-ipcity header
    const res = await fetchViaHTTP(
      next.url,
      '/api/headers',
      {},
      {
        headers: {
          'x-city': 'Montréal',
        },
      }
    )

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-middleware-ran']).toBe('true')
    expect(headers['x-city']).toBe('Montréal')
  })

  it('should handle headers with German umlauts (München)', async () => {
    const res = await fetchViaHTTP(
      next.url,
      '/api/headers',
      {},
      {
        headers: {
          'x-city': 'München',
        },
      }
    )

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-middleware-ran']).toBe('true')
    expect(headers['x-city']).toBe('München')
  })

  it('should handle headers with Spanish characters (España)', async () => {
    const res = await fetchViaHTTP(
      next.url,
      '/api/headers',
      {},
      {
        headers: {
          'x-country': 'España',
        },
      }
    )

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-middleware-ran']).toBe('true')
    expect(headers['x-country']).toBe('España')
  })

  it('should handle headers with Nordic characters (Malmö, København)', async () => {
    const res = await fetchViaHTTP(
      next.url,
      '/api/headers',
      {},
      {
        headers: {
          'x-city': 'Malmö',
          'x-region': 'København',
        },
      }
    )

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-middleware-ran']).toBe('true')
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
          'x-region': 'Île-de-France',
        },
      }
    )

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-middleware-ran']).toBe('true')
    expect(headers['x-region']).toBe('Île-de-France')
  })

  it('should handle headers with Austrian characters (Österreich)', async () => {
    const res = await fetchViaHTTP(
      next.url,
      '/api/headers',
      {},
      {
        headers: {
          'x-country': 'Österreich',
        },
      }
    )

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-middleware-ran']).toBe('true')
    expect(headers['x-country']).toBe('Österreich')
  })

  it('should handle multiple headers with various Latin-1 characters', async () => {
    const res = await fetchViaHTTP(
      next.url,
      '/api/headers',
      {},
      {
        headers: {
          'x-city': 'Montréal',
          'x-region': 'Île-de-France',
          'x-country': 'Österreich',
          'x-greeting': 'Grüß Gott',
        },
      }
    )

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-middleware-ran']).toBe('true')
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
          'x-city': 'São Paulo',
        },
      }
    )

    expect(res.status).toBe(200)
    const headers = await res.json()
    expect(headers['x-middleware-ran']).toBe('true')
    expect(headers['x-city']).toBe('São Paulo')
  })
})
