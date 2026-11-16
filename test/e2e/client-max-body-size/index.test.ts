import { nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'
import { createServer, request, type Server } from 'http'

describe('client-max-body-size', () => {
  // This tests the self-hosted replay stream and a loopback HTTP upstream.
  // A deployed proxy runs on a different host and cannot reach that upstream.
  // The other describes below cover the deployed request-size behavior.
  // @force-gate !deploy
  describe('replayed HTTP body framing', () => {
    const limit = 32 * 1024
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      nextConfig: { experimental: { proxyClientMaxBodySize: limit } },
    })
    let upstream: Server

    beforeAll(async () => {
      upstream = createServer((req, res) => {
        let bodySize = 0
        req.on('data', (chunk) => {
          bodySize += chunk.length
        })
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              bodySize,
              contentLength: req.headers['content-length'] ?? null,
              probe: req.headers['x-body-probe'] ?? null,
            })
          )
        })
      })
      await new Promise<void>((resolve) =>
        upstream.listen(0, '127.0.0.1', resolve)
      )
      const address = upstream.address()
      if (!address || typeof address === 'string') {
        throw new Error('Expected an HTTP upstream port')
      }
      await next.start({
        env: { TEST_PROXY_TARGET: `http://127.0.0.1:${address.port}` },
      })
    })

    afterAll(async () => {
      upstream?.closeAllConnections()
      await new Promise<void>((resolve) => upstream?.close(() => resolve()))
    })

    for (const path of ['/api/echo', '/api/external']) {
      for (const override of [false, true]) {
        for (const chunked of [false, true]) {
          for (const size of [limit / 2, limit, limit * 2]) {
            it(`frames ${size} bytes for ${path} (override=${override}, chunked=${chunked})`, async () => {
              const result = await new Promise<{
                bodySize: number
                contentLength: string | null
                probe: string | null
              }>((resolve, reject) => {
                const req = request(
                  `${next.url}${path}${override ? '?override' : ''}`,
                  {
                    method: 'POST',
                    headers: chunked ? {} : { 'Content-Length': size },
                  },
                  (res) => {
                    const chunks: Buffer[] = []
                    res.on('data', (chunk) => chunks.push(chunk))
                    res.on('error', reject)
                    res.on('end', () => {
                      try {
                        expect(res.statusCode).toBe(200)
                        resolve(JSON.parse(Buffer.concat(chunks).toString()))
                      } catch (error) {
                        reject(error)
                      }
                    })
                  }
                )
                req.on('error', reject)
                req.setTimeout(10_000, () => {
                  req.destroy(
                    new Error('Timed out waiting for the replay body')
                  )
                })
                // Separate write/end keeps the length unknown for chunked input.
                req.write(Buffer.alloc(size, 'x'))
                req.end()
              })
              if (size > limit) {
                expect(result.bodySize).toBeLessThanOrEqual(limit)
                expect(result.bodySize).toBeLessThan(size)
              } else {
                expect(result.bodySize).toBe(size)
              }
              expect(result.contentLength).toBe(
                chunked ? null : String(result.bodySize)
              )
              expect(result.probe).toBe(override ? 'preserved' : null)
            })
          }
        }
      }
    }
  })

  // These 5, 10, and 11 MiB requests exceed the Vercel test deployment's
  // 4.5 MB payload limit and receive 413 instead of 200. Next.js's 10 MiB
  // buffering limit does not configure Vercel's separate acceptance limit.
  // @force-gate !deploy
  describe('default 10MB limit', () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should accept request body over 10MB but only buffer up to limit', async () => {
      const bodySize = 11 * 1024 * 1024 // 11MB
      const body = 'x'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/echo',
        {},
        {
          body,
          method: 'POST',
        }
      )

      expect(res.status).toBe(200)
      const responseBody = await res.json()
      expect(responseBody.message).toBe('Hello World')
      // Should only buffer up to 10MB, not the full 11MB
      expect(responseBody.bodySize).toBeLessThanOrEqual(10 * 1024 * 1024)
      expect(responseBody.bodySize).toBeLessThan(bodySize)
      expect(next.cliOutput).toContain(
        'Request body exceeded 10MB for /api/echo'
      )
    })

    it('should accept request body at exactly 10MB', async () => {
      const bodySize = 10 * 1024 * 1024 // 10MB
      const body = 'y'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/echo',
        {},
        {
          body,
          method: 'POST',
        }
      )

      expect(res.status).toBe(200)
      const responseBody = await res.json()
      expect(responseBody.message).toBe('Hello World')
      expect(responseBody.bodySize).toBe(bodySize)
    })

    it('should accept request body under 10MB', async () => {
      const bodySize = 5 * 1024 * 1024 // 5MB
      const body = 'z'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/echo',
        {},
        {
          body,
          method: 'POST',
        }
      )

      expect(res.status).toBe(200)
      const responseBody = await res.json()
      expect(responseBody.message).toBe('Hello World')
      expect(responseBody.bodySize).toBe(bodySize)
    })
  })

  describe('custom limit with string format', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        experimental: {
          proxyClientMaxBodySize: '5mb',
        },
      },
    })

    // The 6 MiB request exceeds Vercel's 4.5 MB payload limit and receives 413.
    // Next.js's 5 MiB buffering limit does not raise that platform limit.
    // @force-gate !deploy
    it('should accept request body over custom 5MB limit but only buffer up to limit', async () => {
      const bodySize = 6 * 1024 * 1024 // 6MB
      const body = 'a'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/echo',
        {},
        {
          body,
          method: 'POST',
        }
      )

      expect(res.status).toBe(200)
      const responseBody = await res.json()
      expect(responseBody.message).toBe('Hello World')
      // Should only buffer up to 5MB, not the full 6MB
      expect(responseBody.bodySize).toBeLessThanOrEqual(5 * 1024 * 1024)
      expect(responseBody.bodySize).toBeLessThan(bodySize)
      expect(next.cliOutput).toContain(
        'Request body exceeded 5MB for /api/echo'
      )
    })

    it('should accept request body under custom 5MB limit', async () => {
      const bodySize = 4 * 1024 * 1024 // 4MB
      const body = 'b'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/echo',
        {},
        {
          body,
          method: 'POST',
        }
      )

      expect(res.status).toBe(200)
      const responseBody = await res.json()
      expect(responseBody.message).toBe('Hello World')
      expect(responseBody.bodySize).toBe(bodySize)
    })
  })

  describe('custom limit with number format', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        experimental: {
          proxyClientMaxBodySize: 2 * 1024 * 1024, // 2MB in bytes
        },
      },
    })

    // Vercel accepts all 3 MiB without applying Next.js's 2 MiB local
    // middleware buffering limit, so the truncation assertion fails.
    // @force-gate !deploy
    it('should accept request body over custom 2MB limit but only buffer up to limit', async () => {
      const bodySize = 3 * 1024 * 1024 // 3MB
      const body = 'c'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/echo',
        {},
        {
          body,
          method: 'POST',
        }
      )

      expect(res.status).toBe(200)
      const responseBody = await res.json()
      expect(responseBody.message).toBe('Hello World')
      // Should only buffer up to 2MB, not the full 3MB
      expect(responseBody.bodySize).toBeLessThanOrEqual(2 * 1024 * 1024)
      expect(responseBody.bodySize).toBeLessThan(bodySize)
      expect(next.cliOutput).toContain(
        'Request body exceeded 2MB for /api/echo'
      )
    })

    it('should accept request body under custom 2MB limit', async () => {
      const bodySize = 1 * 1024 * 1024 // 1MB
      const body = 'd'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/echo',
        {},
        {
          body,
          method: 'POST',
        }
      )

      expect(res.status).toBe(200)
      const responseBody = await res.json()
      expect(responseBody.message).toBe('Hello World')
      expect(responseBody.bodySize).toBe(bodySize)
    })
  })

  // These 20 and 51 MiB requests exceed the Vercel test deployment's
  // 4.5 MB payload limit and receive 413 instead of 200. Setting Next.js's
  // buffer to 50 MiB does not raise Vercel's separate acceptance limit.
  // @force-gate !deploy
  describe('large custom limit', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        experimental: {
          proxyClientMaxBodySize: '50mb',
        },
      },
    })

    it('should accept request body up to 50MB with custom limit', async () => {
      const bodySize = 20 * 1024 * 1024 // 20MB
      const body = 'e'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/echo',
        {},
        {
          body,
          method: 'POST',
        }
      )

      expect(res.status).toBe(200)
      const responseBody = await res.json()
      expect(responseBody.message).toBe('Hello World')
      expect(responseBody.bodySize).toBe(bodySize)
    })

    it('should accept request body over custom 50MB limit but only buffer up to limit', async () => {
      const bodySize = 51 * 1024 * 1024 // 51MB
      const body = 'f'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/echo',
        {},
        {
          body,
          method: 'POST',
        }
      )

      expect(res.status).toBe(200)
      const responseBody = await res.json()
      expect(responseBody.message).toBe('Hello World')
      // Should only buffer up to 50MB, not the full 51MB
      expect(responseBody.bodySize).toBeLessThanOrEqual(50 * 1024 * 1024)
      expect(responseBody.bodySize).toBeLessThan(bodySize)
      expect(next.cliOutput).toContain(
        'Request body exceeded 50MB for /api/echo'
      )
    })
  })
})
