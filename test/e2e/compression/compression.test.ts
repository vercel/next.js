import { nextTestSetup } from 'e2e-utils'
import { fetchViaRawHttp, gate } from 'next-test-utils'
import { gunzipSync } from 'zlib'

// Raw requests do no transparent decompression, so header assertions are
// truthful and the body has to be decoded by hand.
async function fetchCompressed(next: { url: string }, pathname: string) {
  const response = await fetchViaRawHttp(next.url, pathname, {
    headers: { 'accept-encoding': 'gzip' },
  })
  const buf = Buffer.from(await response.arrayBuffer())
  const body =
    response.headers.get('content-encoding') === 'gzip'
      ? gunzipSync(buf).toString()
      : buf.toString()
  return { response, body }
}

describe('Compression', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should compress responses by default', async () => {
    const { response, body } = await fetchCompressed(next, '/')

    expect(response.headers.get('content-encoding')).toBe('gzip')
    // Compression removes Content-Length since the compressed size is
    // not known up front.
    expect(response.headers.get('content-length')).toBeNull()
    expect(body).toContain('<div id="hello">OK</div>')
  })

  it('should compress route handler responses above 1kb', async () => {
    const { response, body } = await fetchCompressed(next, '/route-large')

    expect(response.headers.get('content-encoding')).toBe('gzip')
    expect(response.headers.get('content-length')).toBeNull()
    expect(body).toBe('x'.repeat(2048))
  })

  it('should not compress route handler responses below 1kb', async () => {
    const { response, body } = await fetchCompressed(next, '/route-small')

    if (await gate('cacheComponents && (deploy || adapter)')) {
      // With cacheComponents the sync route handler is prerendered, and
      // the deployment serves the buffered body with a Content-Length
      // below the 1kb compression threshold, so it is not compressed.
      expect(response.headers.get('content-encoding')).toBeNull()
    } else if (await gate('deploy || adapter')) {
      expect(response.headers.get('content-encoding')).toBe('gzip')
      // The deployment streams the response without a Content-Length, so
      // the 1kb compression threshold never engages.
      expect(response.headers.get('content-length')).toBeNull()
    } else {
      // The body is complete when the response starts, so the server sends
      // it with a Content-Length, which is below the 1kb compression
      // threshold.
      expect(response.headers.get('content-encoding')).toBeNull()
      expect(response.headers.get('content-length')).toBe('100')
    }
    expect(body).toBe('x'.repeat(100))
  })

  it('should compress dynamic route handler responses above 1kb', async () => {
    const { response, body } = await fetchCompressed(
      next,
      '/route-dynamic-large'
    )

    expect(response.headers.get('content-encoding')).toBe('gzip')
    expect(response.headers.get('content-length')).toBeNull()
    expect(body).toBe('x'.repeat(2048))
  })

  it('should not compress dynamic route handler responses below 1kb', async () => {
    const { response, body } = await fetchCompressed(
      next,
      '/route-dynamic-small'
    )

    if (await gate('deploy || adapter')) {
      expect(response.headers.get('content-encoding')).toBe('gzip')
      // The deployment streams the response without a Content-Length, so
      // the 1kb compression threshold never engages.
      expect(response.headers.get('content-length')).toBeNull()
    } else {
      // The body is complete when the response starts, so the server sends
      // it with a Content-Length, which is below the 1kb compression
      // threshold.
      expect(response.headers.get('content-encoding')).toBeNull()
      expect(response.headers.get('content-length')).toBe('100')
    }
    expect(body).toBe('x'.repeat(100))
  })
})
