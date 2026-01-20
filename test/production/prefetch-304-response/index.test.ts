import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { join } from 'path'
import { fetchViaHTTP } from 'next-test-utils'

describe('Prefetch 304 Response', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'app/pages')),
      },
    })
  })
  afterAll(() => next.destroy())

  it('should return 304 for subsequent prefetch requests with matching ETag', async () => {
    // First prefetch request
    const firstRes = await fetchViaHTTP(
      next.url,
      `/_next/data/${next.buildId}/ssg.json`,
      undefined,
      {
        headers: {
          purpose: 'prefetch',
        },
      }
    )
    expect(firstRes.status).toBe(200)
    const etag = firstRes.headers.get('etag')
    expect(etag).toBeTruthy()

    // Second prefetch request with If-None-Match header
    const secondRes = await fetchViaHTTP(
      next.url,
      `/_next/data/${next.buildId}/ssg.json`,
      undefined,
      {
        headers: {
          purpose: 'prefetch',
          'if-none-match': etag!,
        },
      }
    )

    // Should return 304 Not Modified since content hasn't changed
    expect(secondRes.status).toBe(304)
  })

  it('should return 304 for HTML prefetch requests with matching ETag', async () => {
    // First request for HTML page
    const firstRes = await fetchViaHTTP(next.url, '/ssg', undefined, {
      headers: {
        purpose: 'prefetch',
      },
    })
    expect(firstRes.status).toBe(200)
    const etag = firstRes.headers.get('etag')
    expect(etag).toBeTruthy()

    // Second request with If-None-Match header
    const secondRes = await fetchViaHTTP(next.url, '/ssg', undefined, {
      headers: {
        purpose: 'prefetch',
        'if-none-match': etag!,
      },
    })

    // Should return 304 Not Modified since content hasn't changed
    expect(secondRes.status).toBe(304)
  })
})
