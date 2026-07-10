import http from 'http'
import { nextTestSetup } from 'e2e-utils'

describe('app-dir - redirect duplicate headers (#82117)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Read the raw, unmerged response headers off the wire. Node's parsed
  // `IncomingMessage.headers` discards duplicate `location` values, so a
  // duplicated header would be invisible there. `rawHeaders` is the flat
  // `[name, value, name, value, ...]` list as received, which lets us count
  // how many times a header actually appears on the wire.
  function getRawHeaders(
    path: string
  ): Promise<{ statusCode: number; rawHeaders: string[] }> {
    return new Promise((resolve, reject) => {
      // `http.get` does not follow redirects, so we observe the redirect
      // response directly (equivalent to `redirect: 'manual'`).
      const req = http.get(new URL(path, next.url), (res) => {
        // Drain the body so the socket can close.
        res.resume()
        resolve({
          statusCode: res.statusCode ?? 0,
          rawHeaders: res.rawHeaders,
        })
      })
      req.on('error', reject)
    })
  }

  function valuesFor(rawHeaders: string[], name: string): string[] {
    const lower = name.toLowerCase()
    const values: string[] = []
    for (let i = 0; i < rawHeaders.length; i += 2) {
      if (rawHeaders[i].toLowerCase() === lower) {
        values.push(rawHeaders[i + 1])
      }
    }
    return values
  }

  it('emits the Location header exactly once on a force-static redirect', async () => {
    const { statusCode, rawHeaders } = await getRawHeaders('/redirect-source')

    // The redirect must still happen.
    expect(statusCode).toBeGreaterThanOrEqual(300)
    expect(statusCode).toBeLessThan(400)

    // Before the fix, the cache-serving loop appended `Location` on top of the
    // value set during render, producing two `Location` headers on the wire
    // (which merge to `/dest, /dest` behind proxies like Cloudflare and 404).
    // It must appear exactly once.
    const location = valuesFor(rawHeaders, 'location')
    expect(location).toHaveLength(1)
    expect(location[0]).toContain('/dest')

    // `x-nextjs-stale-time` is duplicated by the same code path when present.
    const staleTime = valuesFor(rawHeaders, 'x-nextjs-stale-time')
    expect(staleTime.length).toBeLessThanOrEqual(1)
  })
})
