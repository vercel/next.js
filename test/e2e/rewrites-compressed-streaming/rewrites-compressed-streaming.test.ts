import http from 'http'
import type { AddressInfo } from 'net'
import zlib from 'zlib'
import { nextTestSetup } from 'e2e-utils'

// @force-gate !deploy
describe('rewrites-compressed-streaming', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  let upstream: http.Server
  const openStreams = new Set<http.ServerResponse>()

  beforeAll(async () => {
    upstream = http.createServer((req, res) => {
      if (req.url !== '/events') {
        res.statusCode = 404
        res.end()
        return
      }

      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      })
      res.write('data: first\n\n')
      openStreams.add(res)
      res.on('close', () => openStreams.delete(res))
    })

    await new Promise<void>((resolve) =>
      upstream.listen(0, '127.0.0.1', resolve)
    )
    const { port } = upstream.address() as AddressInfo

    await next.start({ env: { TEST_UPSTREAM_PORT: String(port) } })
  })

  afterAll(async () => {
    for (const res of openStreams) res.end()
    await new Promise<void>((resolve) => upstream.close(() => resolve()))
  })

  it('delivers each chunk of a compressed proxied stream before the stream ends', async () => {
    const url = new URL('/rewrites/events', next.url)

    const { encoding, received } = await new Promise<{
      encoding: string | undefined
      received: string
    }>((resolve, reject) => {
      const req = http.get(
        url,
        { headers: { 'accept-encoding': 'gzip' } },
        (res) => {
          const encoding = res.headers['content-encoding']
          const gunzip = zlib.createGunzip()
          let received = ''

          const timeout = setTimeout(() => {
            req.destroy()
            resolve({ encoding, received })
          }, 5000)

          gunzip.on('data', (chunk: Buffer) => {
            received += chunk.toString()
            if (received.includes('data: first')) {
              clearTimeout(timeout)
              req.destroy()
              resolve({ encoding, received })
            }
          })
          gunzip.on('error', () => {})
          res.on('error', () => {})
          res.pipe(gunzip)
        }
      )
      req.on('error', (err) => {
        if (!req.destroyed) reject(err)
      })
    })

    expect(encoding).toBe('gzip')
    expect(received).toContain('data: first')
  })
})
