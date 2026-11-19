import { availableParallelism } from 'os'
import { gunzipSync, inflateSync } from 'zlib'
import { nextTestSetup } from 'e2e-utils'
import { SWITCHYARD_ENV } from 'next/dist/server/lib/switchyard-env'
import { getHeader, rawRequest, type RawResponse } from '../switchyard/raw-http'

// What a route.go handler receives, and what its client gets back, under
// `next start`. Every expectation is today's behavior, so the suite passes
// with or without Switchyard in front of Node, whichever of them ends up
// calling the Go worker.
// route.go is only supported by Turbopack.
// @force-gate turbopack
describe('switchyard-go', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (skipped) return

  /** Sends a request and returns what the echo route says it received. */
  async function received(
    target: string,
    lines: string[] = [],
    method = 'GET',
    body?: Buffer
  ) {
    const head = [
      `${method} ${target} HTTP/1.1`,
      `Host: localhost:${next.appPort}`,
      ...lines,
    ].join('\r\n')
    const res = await rawRequest(Number(next.appPort), head, body)
    expect(res.status).toBe(200)
    return JSON.parse(res.body.toString())
  }

  /** Sends a request over a fresh connection, byte for byte. */
  function send(target: string, lines: string[] = [], method = 'GET') {
    return rawRequest(
      Number(next.appPort),
      [
        `${method} ${target} HTTP/1.1`,
        `Host: localhost:${next.appPort}`,
        ...lines,
      ].join('\r\n')
    )
  }

  describe('the request the worker gets', () => {
    it('passes a plain request target and fills x-forwarded-* when missing', async () => {
      const got = await received('/go/users/42?sort=asc')
      expect(got).toMatchObject({
        method: 'GET',
        requestURI: '/go/users/42?sort=asc',
        rawQuery: 'sort=asc',
        host: `localhost:${next.appPort}`,
        proto: 'HTTP/1.1',
        params: { id: '42' },
      })
      expect(got.header).toMatchObject({
        'X-Forwarded-Host': [`localhost:${next.appPort}`],
        'X-Forwarded-Port': [String(next.appPort)],
        'X-Forwarded-Proto': ['http'],
        'X-Forwarded-For': ['::ffff:127.0.0.1'],
      })
      expect(got.header['X-Next-Internal-Go-Token']).toBeUndefined()
    })

    it('sends exactly these headers for a request with only Host', async () => {
      const got = await received('/go/echo')
      expect(Object.keys(got.header).sort()).toEqual([
        'Connection',
        'X-Forwarded-For',
        'X-Forwarded-Host',
        'X-Forwarded-Port',
        'X-Forwarded-Proto',
      ])
      expect(got.header['Connection']).toEqual(['keep-alive'])
    })

    it('keeps the forwarded headers the client sends', async () => {
      const got = await received('/go/echo', [
        'X-Forwarded-For: 203.0.113.7',
        'X-Forwarded-Host: shop.example.com',
        'X-Forwarded-Proto: https',
        'X-Forwarded-Port: 443',
      ])
      expect(got.header).toMatchObject({
        'X-Forwarded-For': ['203.0.113.7'],
        'X-Forwarded-Host': ['shop.example.com'],
        'X-Forwarded-Proto': ['https'],
        'X-Forwarded-Port': ['443'],
      })
    })

    it('removes internal and hop-by-hop request headers', async () => {
      const got = await received('/go/echo', [
        'X-Middleware-Rewrite: /elsewhere',
        'X-Matched-Path: /elsewhere',
        'X-Next-Internal-Go-Token: forged',
        'X-Next-Internal-Anything: forged',
        'X-Custom: kept',
        'Connection: X-Listed, close',
        'X-Listed: dropped',
        'Te: trailers',
      ])
      expect(got.header['X-Custom']).toEqual(['kept'])
      for (const name of [
        'X-Middleware-Rewrite',
        'X-Matched-Path',
        'X-Next-Internal-Go-Token',
        'X-Next-Internal-Anything',
        'X-Listed',
        'Te',
      ]) {
        expect(got.header[name]).toBeUndefined()
      }
    })

    it('keeps only the first value of a repeated single-value header', async () => {
      const got = await received('/go/echo', [
        'User-Agent: first',
        'User-Agent: second',
        'X-Repeated: one',
        'X-Repeated: two',
      ])
      expect(got.header['User-Agent']).toEqual(['first'])
      expect(got.header['X-Repeated']).toEqual(['one', 'two'])
    })

    it('streams a request body to the worker', async () => {
      const got = await received(
        '/go/echo',
        ['Content-Type: text/plain', 'Content-Length: 12'],
        'POST',
        Buffer.from('request body')
      )
      expect(got).toMatchObject({
        method: 'POST',
        body: 'request body',
        contentLength: 12,
      })
    })

    it('passes catch-all segments', async () => {
      const got = await received('/go/files/a/b/c.txt')
      expect(got).toMatchObject({
        requestURI: '/go/files/a/b/c.txt',
        params: { path: 'a/b/c.txt' },
      })
    })

    // Node parses the query and writes it out again before calling the
    // worker, so the worker can see a different query string than the client
    // sent.
    it.each([
      ['?key=one&key=two', '?key=one&key=two'],
      ['?a', '?a='],
      ['?a=%7e', '?a=~'],
      ['?b=1&a=2&b=3', '?b=1&b=3&a=2'],
      ['?b=1&2=x&1=y', '?1=y&2=x&b=1'],
      ['?__proto__=1&k=2', '?k=2'],
      ['?constructor=x', '?constructor=&constructor=x'],
      ['?a==b', '?a=%3Db'],
      ['?a+b', '?a%20b='],
      ['?a=1;b=2', '?a=1%3Bb%3D2'],
      ['?r=it%27s', "?r=it's"],
      ['?&&a=1', '?a=1'],
      ['?', ''],
    ])('rewrites the query %s as %s', async (sent, expected) => {
      const got = await received(`/go/echo${sent}`)
      expect(got.requestURI).toBe(`/go/echo${expected}`)
    })

    it.each([
      ['/go/users/a%20b', '/go/users/a%20b', 'a b'],
      ['/go/users/../users/7', '/go/users/7', '7'],
      ['/go/users/./8', '/go/users/8', '8'],
      ['/go/users/caf%C3%A9', '/go/users/caf%C3%A9', 'café'],
    ])('sends %s to the worker as %s', async (sent, expected, id) => {
      const got = await received(sent)
      expect(got.requestURI).toBe(expected)
      expect(got.params.id).toBe(id)
    })
  })

  describe('the worker process', () => {
    // route.go workers run the app's own Go code. Under Switchyard they run it
    // on at most 4 threads at once by default, so they don't compete with
    // Switchyard and Node for every core; Switchyard's own process has a
    // separate limit. Without Switchyard, Go picks one thread per core.
    it('limits the threads a route.go worker runs Go code on', async () => {
      const { goMaxProcs } = await received('/go/echo')
      const cores = availableParallelism()
      expect(goMaxProcs).toBe(
        process.env[SWITCHYARD_ENV] === '1' ? Math.min(4, cores) : cores
      )
    })
  })

  describe('what Node answers before the worker', () => {
    it('counts Host toward Node’s request-header limit', async () => {
      await send('/go/echo')
      const res = await rawRequest(
        Number(next.appPort),
        [
          'GET /go/echo HTTP/1.1',
          `Host: ${'h'.repeat(4000)}.example`,
          `X-Large: ${'x'.repeat(12500)}`,
        ].join('\r\n')
      )
      expect(res.status).toBe(431)
    })

    it('redirects a trailing slash', async () => {
      const res = await send('/go/users/42/')
      expect(res.status).toBe(308)
      expect(getHeader(res, 'location')).toBe('/go/users/42')
    })

    it('redirects repeated slashes', async () => {
      const res = await send('/go//users/42')
      expect(res.status).toBe(308)
      expect(getHeader(res, 'location')).toBe('/go/users/42')
    })

    it('serves a page that shadows the dynamic route', async () => {
      const res = await send('/go/users/new')
      expect(res.status).toBe(200)
      expect(res.body.toString()).toContain('new user page')
    })

    it('serves a public file that shadows the dynamic route', async () => {
      const res = await send('/go/users/from-public.txt')
      expect(res.status).toBe(200)
      expect(res.body.toString()).toBe('from public\n')
    })

    it('serves pages API routes', async () => {
      const res = await send('/api/hello')
      expect(JSON.parse(res.body.toString())).toEqual({ from: 'pages api' })
    })
  })

  describe('the response the client gets', () => {
    it.each([
      ['json', true],
      ['text', true],
      ['svg', true],
      ['customjson', true],
      ['png', false],
      ['unknown', false],
    ])(
      'varies %s by Accept-Encoding when appropriate',
      async (type, varies) => {
        // Plain query values keep these requests eligible for the direct path.
        const target = `/go/extras?type=${type}`
        await send(target)
        const res = await send(target)
        expect(getHeader(res, 'vary')).toBe(
          varies ? 'Accept-Encoding' : undefined
        )
      }
    )

    it('preserves existing Vary fields and respects no-transform', async () => {
      for (const [query, expected] of [
        ['vary=Origin', 'Origin, Accept-Encoding'],
        ['vary=accept-encoding', 'accept-encoding'],
        ['vary=wildcard', '*'],
        ['cacheControl=no-transform', undefined],
      ]) {
        const target = `/go/extras?${query}`
        await send(target)
        const res = await send(target)
        expect(getHeader(res, 'vary')).toBe(expected)
      }
    })

    it('rejects worker response headers larger than Node’s limit', async () => {
      // Both the first request through Node and subsequent direct requests
      // must fail, rather than returning 200 once the worker is announced.
      for (let i = 0; i < 2; i++) {
        const res = await send('/go/extras?largeHeader=1')
        expect(res.status).toBe(500)
      }
    })

    // Like the switchyard suite: Switchyard writes Go's reason phrase, Node
    // its own.
    it.each([
      { code: 201, nodeReason: 'Created', goReason: 'Created' },
      {
        code: 413,
        nodeReason: 'Payload Too Large',
        goReason: 'Request Entity Too Large',
      },
      { code: 418, nodeReason: "I'm a Teapot", goReason: "I'm a teapot" },
    ])(
      'returns $code with the active server’s reason phrase',
      async ({ code, nodeReason, goReason }) => {
        const res = await send(`/go/status/${code}`)
        const reason =
          process.env[SWITCHYARD_ENV] === '1' ? goReason : nodeReason
        expect(res.statusLine).toBe(`HTTP/1.1 ${code} ${reason}`)
        expect(res.body.toString()).toBe('status')
      }
    )

    it('drops early hints, keeps repeated Set-Cookie and the Trailer header', async () => {
      const res = await send('/go/extras')
      expect(res.status).toBe(200)
      expect(res.headers.filter(([name]) => name === 'set-cookie')).toEqual([
        ['set-cookie', 'first=1; Path=/'],
        ['set-cookie', 'second=2; Path=/'],
      ])
      expect(getHeader(res, 'link')).toBe('</style.css>; rel=preload; as=style')
      expect(getHeader(res, 'trailer')).toBe('X-Checksum')
      expect(getHeader(res, 'content-encoding')).toBeUndefined()
    })

    it('passes on the hop-by-hop headers the handler sets', async () => {
      // The first request starts the worker through Node; the second can go
      // to the worker directly.
      await send('/go/hop')
      const res = await send('/go/hop')
      expect(res.status).toBe(200)
      expect(Object.fromEntries(res.headers)).toMatchObject({
        'keep-alive': 'timeout=7',
        'proxy-authenticate': 'Basic realm="switchyard"',
        'proxy-authorization': 'Basic c3dpdGNoeWFyZA==',
        'proxy-connection': 'keep-alive',
        te: 'trailers',
        upgrade: 'h2c',
        'x-hop': 'listed',
      })
      expect(getHeader(res, 'connection')).toBe('close')
      expect(res.body.toString()).toBe('hop')
    })

    it('drops the trailer values the handler sends', async () => {
      const trailers = await responseTrailers(
        Number(next.appPort),
        '/go/extras'
      )
      expect(trailers).toEqual({})
    })

    it('compresses a compressible response when the client accepts gzip', async () => {
      const res = await send('/go/extras', ['Accept-Encoding: gzip'])
      expect(res.status).toBe(200)
      expect(getHeader(res, 'content-encoding')).toBe('gzip')
      expect(getHeader(res, 'vary')).toContain('Accept-Encoding')
      expect(JSON.parse(gunzipSync(res.body).toString()).padding).toHaveLength(
        2048
      )
    })

    it('answers HEAD without a body and OPTIONS with the methods', async () => {
      const head = await send('/go/echo', [], 'HEAD')
      expect(head.status).toBe(200)
      expect(head.body.length).toBe(0)
      const options = await send('/go/echo', [], 'OPTIONS')
      expect(options.status).toBe(204)
      expect(getHeader(options, 'allow')).toBe('GET, HEAD, OPTIONS, POST')
    })

    // TODO: with Switchyard, a direct request whose worker fails gets
    // a plain 500 instead of Node's error page. Matching Node needs Switchyard
    // to hand the request back and Node to trust that the worker failed,
    // which waits for the token on Node's private listener.
    // @gate !switchyard
    it('answers Node’s error page when the handler panics', async () => {
      // The first request to a route.go starts its worker through Node; the
      // second can go to the worker directly.
      await send('/go/panic')
      const res = await send('/go/panic')
      expect(res.statusLine).toBe('HTTP/1.1 500 Internal Server Error')
      expect(Object.fromEntries(res.headers)).toMatchObject({
        'cache-control':
          'private, no-cache, no-store, max-age=0, must-revalidate',
        'x-powered-by': 'Next.js',
        'content-type': 'text/html; charset=utf-8',
      })
      const html = res.body.toString()
      expect(html).toContain('500: Internal Server Error')
      expect(html).toContain('"page":"/_error"')
      expect(html).toContain('"statusCode":500')
    })

    it('keeps a handler failure out of shared caches', async () => {
      // The first request starts the worker through Node; the second can go
      // to the worker directly.
      for (const res of [await send('/go/panic'), await send('/go/panic')]) {
        expect(res.statusLine).toBe('HTTP/1.1 500 Internal Server Error')
        expect(getHeader(res, 'cache-control')).toBe(
          'private, no-cache, no-store, max-age=0, must-revalidate'
        )
      }
    })

    it('sends the first chunk of a streaming response before it ends', async () => {
      const first = await firstChunk(Number(next.appPort), '/go/stream')
      expect(first.toString()).toBe('first')
    })
  })

  // Node's compression middleware (the `compress` option, on by default)
  // decides per response whether to gzip or deflate it. Each request is sent
  // twice: the first starts the route's worker through Node, the second may
  // go to the worker directly.
  describe('compression', () => {
    /** Sends the request twice and checks both answers the same way. */
    async function twice(
      target: string,
      lines: string[],
      check: (res: RawResponse) => void,
      method = 'GET'
    ) {
      for (let i = 0; i < 2; i++) {
        check(await send(target, lines, method))
      }
    }

    function decoded(res: RawResponse): string {
      switch (getHeader(res, 'content-encoding')) {
        case 'gzip':
          return gunzipSync(res.body).toString()
        case 'deflate':
          return inflateSync(res.body).toString()
        default:
          return res.body.toString()
      }
    }

    it.each([
      ['gzip', 'gzip'],
      ['deflate', 'deflate'],
      ['gzip, deflate, br, zstd', 'gzip'],
      ['deflate, gzip', 'gzip'],
      // The middleware picks gzip over deflate whenever gzip is acceptable.
      ['deflate;q=1, gzip;q=0.5', 'gzip'],
      ['GZIP', 'gzip'],
      ['*', 'gzip'],
      ['deflate, *;q=0', 'deflate'],
      ['br, zstd', undefined],
      ['identity', undefined],
      ['x-gzip', undefined],
      ['gzip;q=0', undefined],
      ['gzip;q=0.5, identity', undefined],
      ['gzip; q=0.5, identity;q=0.4', 'gzip'],
      ['*;q=0', undefined],
    ])(
      'picks the encoding for Accept-Encoding: %s',
      async (accept, expected) => {
        await twice(
          '/go/compress?size=2048',
          [`Accept-Encoding: ${accept}`],
          (res) => {
            expect(res.status).toBe(200)
            expect(getHeader(res, 'content-encoding')).toBe(expected)
            expect(getHeader(res, 'vary')).toBe('Accept-Encoding')
            expect(decoded(res)).toBe('x'.repeat(2048))
          }
        )
      }
    )

    it.each([
      // A Content-Length below 1 KiB stays uncompressed, and so does an empty
      // body; a body of unknown length is compressed however short it is.
      ['size=1023', undefined, '1023', undefined],
      ['size=1024', 'gzip', undefined, 'chunked'],
      ['size=5&chunked=1', 'gzip', undefined, 'chunked'],
      ['size=0&chunked=1', undefined, undefined, 'chunked'],
      ['size=0', undefined, '0', undefined],
    ])(
      'applies the 1 KiB threshold to %s',
      async (query, encoding, contentLength, transferEncoding) => {
        const size = Number(new URLSearchParams(query).get('size'))
        await twice(
          `/go/compress?${query}`,
          ['Accept-Encoding: gzip'],
          (res) => {
            expect(getHeader(res, 'content-encoding')).toBe(encoding)
            expect(getHeader(res, 'content-length')).toBe(contentLength)
            expect(getHeader(res, 'transfer-encoding')).toBe(transferEncoding)
            expect(decoded(res)).toBe('x'.repeat(size))
          }
        )
      }
    )

    it('frames an empty body of unknown length as chunked for any client', async () => {
      // The middleware sends the headers itself when the body ends, before
      // Node could count it, whatever the client accepts.
      for (const query of ['', '&type=png']) {
        await twice(`/go/compress?size=0&chunked=1${query}`, [], (res) => {
          expect(getHeader(res, 'content-length')).toBeUndefined()
          expect(getHeader(res, 'transfer-encoding')).toBe('chunked')
          expect(res.body.length).toBe(0)
        })
      }
    })

    it('leaves a response the middleware skips as the worker sent it', async () => {
      for (const [query, vary] of [
        ['type=png', undefined],
        ['cacheControl=no-transform', undefined],
        ['encoding=br', 'Accept-Encoding'],
        ['status=204', 'Accept-Encoding'],
      ]) {
        await twice(
          `/go/compress?size=2048&${query}`,
          ['Accept-Encoding: gzip'],
          (res) => {
            expect(getHeader(res, 'vary')).toBe(vary)
            expect(getHeader(res, 'content-encoding')).toBe(
              query === 'encoding=br' ? 'br' : undefined
            )
          }
        )
      }
    })

    it('answers HEAD uncompressed but varies it', async () => {
      await twice(
        '/go/compress?size=2048',
        ['Accept-Encoding: gzip'],
        (res) => {
          expect(res.status).toBe(200)
          expect(getHeader(res, 'content-encoding')).toBeUndefined()
          expect(getHeader(res, 'content-length')).toBe('2048')
          expect(getHeader(res, 'vary')).toBe('Accept-Encoding')
          expect(res.body.length).toBe(0)
        },
        'HEAD'
      )
    })

    it('replaces Content-Encoding: identity and keeps the status and ETag', async () => {
      await twice(
        '/go/compress?size=2048&encoding=identity&status=404&etag=1',
        ['Accept-Encoding: gzip'],
        (res) => {
          expect(res.status).toBe(404)
          expect(getHeader(res, 'content-encoding')).toBe('gzip')
          expect(getHeader(res, 'etag')).toBe('"compress-etag"')
          expect(getHeader(res, 'content-length')).toBeUndefined()
          expect(decoded(res)).toBe('x'.repeat(2048))
        }
      )
    })

    it('compresses a body streamed in many parts', async () => {
      await twice(
        '/go/compress?size=4096&parts=20',
        ['Accept-Encoding: gzip'],
        (res) => {
          expect(getHeader(res, 'content-encoding')).toBe('gzip')
          expect(decoded(res)).toBe('x'.repeat(4096 * 20))
        }
      )
    })

    it('holds a streamed chunk in the compressor until more output is ready', async () => {
      // The middleware never flushes zlib between chunks, so the client gets
      // only the 10-byte gzip header until the handler sends enough, or ends.
      for (let i = 0; i < 2; i++) {
        const first = await firstChunk(Number(next.appPort), '/go/stream', {
          'Accept-Encoding': 'gzip',
        })
        expect(first.length).toBe(10)
        expect([...first.subarray(0, 4)]).toEqual([0x1f, 0x8b, 8, 0])
      }
    })
  })
})

/** Reads the body's first chunk of a response that never ends, then closes. */
async function firstChunk(
  port: number,
  path: string,
  headers: Record<string, string> = {}
): Promise<Buffer> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const req = http.request(
      { port, host: '127.0.0.1', path, headers },
      (res) => {
        res.once('data', (chunk: Buffer) => {
          res.destroy()
          resolve(chunk)
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

/** Reads a whole response and returns the trailer fields that came after it. */
async function responseTrailers(
  port: number,
  path: string
): Promise<Record<string, string | undefined>> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const req = http.request({ port, host: '127.0.0.1', path }, (res) => {
      res.resume()
      res.on('end', () => resolve({ ...res.trailers }))
    })
    req.on('error', reject)
    req.end()
  })
}
