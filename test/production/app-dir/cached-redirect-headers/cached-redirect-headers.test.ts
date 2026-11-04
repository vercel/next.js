import { once } from 'node:events'
import http from 'node:http'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const destination = '/destination'

async function getRawResponse(url: URL): Promise<http.IncomingMessage> {
  const response = await new Promise<http.IncomingMessage>(
    (resolve, reject) => {
      http.get(url, resolve).on('error', reject)
    }
  )

  response.resume()
  await once(response, 'end')
  return response
}

function expectSingleRedirect(
  response: http.IncomingMessage,
  statusCode: 307 | 308
) {
  expect(response.statusCode).toBe(statusCode)
  // Normalized Node headers discard duplicate Location values.
  expect(response.headersDistinct.location).toEqual([destination])
  expect(response.headersDistinct['x-nextjs-stale-time']).toHaveLength(1)
}

// The fixture uses dynamic/revalidate segment config, unsupported by Cache Components.
// @force-gate !cacheComponents
describe('cached redirect headers', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Plain it calls inherit the suite gate; it.each bypasses it.
  for (const { pathname, statusCode } of [
    { pathname: '/permanent', statusCode: 308 as const },
    { pathname: '/temporary', statusCode: 307 as const },
  ]) {
    it(`does not duplicate force-static ${statusCode} redirect headers`, async () => {
      const url = new URL(pathname, next.url)

      for (const cacheStatus of ['MISS', 'HIT']) {
        const response = await getRawResponse(url)
        expect(response.headers['x-nextjs-cache']).toBe(cacheStatus)
        expectSingleRedirect(response, statusCode)
      }
    })
  }

  it('does not duplicate ISR fallback redirect headers across revalidation', async () => {
    const url = new URL('/isr/fallback', next.url)

    for (const cacheStatus of ['MISS', 'HIT']) {
      const response = await getRawResponse(url)
      expect(response.headers['x-nextjs-cache']).toBe(cacheStatus)
      expectSingleRedirect(response, 308)
    }

    // Observe expiration and background regeneration instead of assuming timing.
    for (const cacheStatus of ['STALE', 'HIT']) {
      const response = await retry(
        async () => {
          const response = await getRawResponse(url)
          expect(response.headers['x-nextjs-cache']).toBe(cacheStatus)
          return response
        },
        5000,
        100
      )
      expectSingleRedirect(response, 308)
    }
  })
})
