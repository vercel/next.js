import { request, type IncomingHttpHeaders } from 'http'
import { gunzipSync, inflateSync } from 'zlib'
import { nextTestSetup } from 'e2e-utils'
import { SWITCHYARD_ENV } from 'next/dist/server/lib/switchyard-env'

// Only self-hosted next start uses Switchyard. Pausing its Node process
// after warming the workers proves direct requests do not need Node to run.
// route.go requires Turbopack, and this suite also needs a switchyard build.
// @force-gate turbopack
// @force-gate switchyardBinary
describe('switchyard-go direct path', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    env: { [SWITCHYARD_ENV]: '1' },
  })
  if (skipped) return

  /** Sends a GET and returns the status, headers and decompressed body. */
  function get(
    target: string,
    headers: Record<string, string | string[]> = {}
  ): Promise<{
    status: number
    headers: IncomingHttpHeaders
    body: Buffer
  }> {
    return new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port: Number(next.appPort),
          path: target,
          headers,
          // Resume Node in finally if a request unexpectedly needs it.
          signal: AbortSignal.timeout(5000),
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('error', reject)
          res.on('end', () => {
            try {
              const raw = Buffer.concat(chunks)
              const encoding = res.headers['content-encoding']
              resolve({
                status: res.statusCode ?? 0,
                headers: res.headers,
                body:
                  encoding === 'gzip'
                    ? gunzipSync(raw)
                    : encoding === 'deflate'
                      ? inflateSync(raw)
                      : raw,
              })
            } catch (error) {
              reject(error)
            }
          })
        }
      )
      req.on('error', reject)
      req.end()
    })
  }

  /** What the echo route says it received. */
  async function received(
    target: string,
    headers: Record<string, string | string[]> = {}
  ): Promise<{
    parentPid: number
    requestURI: string
    params: Record<string, string>
    header: Record<string, string[]>
  }> {
    const res = await get(target, headers)
    expect(res.status).toBe(200)
    return JSON.parse(res.body.toString())
  }

  it('starts the worker on the first request', async () => {
    expect(await received('/go/users/first')).toMatchObject({
      params: { id: 'first' },
      parentPid: expect.any(Number),
    })
  })

  it('sends plain requests directly while Node is paused', async () => {
    // Each route.go has its own worker, started by its first request.
    for (const target of ['/go/users/warm-up', '/go/echo', '/go/files/x']) {
      await received(target)
    }
    await get('/go/compress?size=2048')
    const { parentPid } = await received('/go/echo')
    process.kill(parentPid, 'SIGSTOP')
    try {
      for (const target of [
        '/go/users/42?sort=asc',
        '/go/echo',
        '/go/files/a/b.txt',
      ]) {
        expect((await received(target)).requestURI).toBe(target)
      }
      // As a browser or fetch sends it.
      const browser = { 'Accept-Encoding': 'gzip, deflate, br, zstd' }
      expect((await received('/go/echo', browser)).requestURI).toBe('/go/echo')
      const cases: Array<[string, string | undefined]> = [
        ['gzip, deflate, br, zstd', 'gzip'],
        ['deflate', 'deflate'],
        ['br', undefined],
      ]
      for (const [accept, encoding] of cases) {
        const res = await get('/go/compress?size=2048', {
          'Accept-Encoding': accept,
        })
        expect(res.headers['content-encoding']).toBe(encoding)
        expect(res.headers['vary']).toBe('Accept-Encoding')
        expect(res.body.toString()).toBe('x'.repeat(2048))
      }
    } finally {
      process.kill(parentPid, 'SIGCONT')
    }
  })

  it('keeps Node’s URL, header and compression handling', async () => {
    expect((await received('/go/users/a%20b')).params.id).toBe('a b')
    expect((await received('/go/echo?a')).requestURI).toBe('/go/echo?a=')
    const repeated = await received('/go/echo', {
      'User-Agent': ['first', 'second'],
    })
    expect(repeated.header['User-Agent']).toEqual(['first'])
    const compressed = await next.fetch('/go/extras', {
      headers: { 'Accept-Encoding': 'gzip' },
    })
    expect(compressed.status).toBe(200)
    expect(compressed.headers.get('content-encoding')).toBe('gzip')
  })
})
