import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { join } from 'path'
import { fetchViaHTTP, waitFor } from 'next-test-utils'

describe('app-dir-prevent-304-caching', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'next.config.js': new FileRef(join(__dirname, 'next.config.js')),
        app: new FileRef(join(__dirname, 'app')),
      },
    })
  })
  afterAll(() => next.destroy())

  // https://github.com/vercel/next.js/issues/56580
  it('should not cache 304 status', async () => {
    // Fresh call
    const rFresh = await fetchViaHTTP(next.url, '/')
    expect(rFresh.status).toBe(200)

    await waitFor(500)

    // Cache HIT but still 200
    const rHit = await fetchViaHTTP(
      next.url,
      '/',
      {},
      {
        headers: {
          'If-None-Match': rFresh.headers.get('etag'),
        },
      }
    )
    expect(rHit.status).toBe(200)
    await waitFor(500)

    // Here happens the race condition
    const r304 = await fetchViaHTTP(
      next.url,
      '/',
      {},
      {
        headers: {
          'If-None-Match': rHit.headers.get('etag'),
        },
      }
    )
    expect(r304.status).toBe(304)
    // ... Postponed but should not save 304 ...
    await waitFor(1000)

    // Now without cache headers should 200
    const rStillFresh = await fetchViaHTTP(next.url, '/')
    expect(rStillFresh.status).toBe(200)
  })
})
