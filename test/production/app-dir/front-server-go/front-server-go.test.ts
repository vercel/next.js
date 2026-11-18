import { gunzipSync } from 'zlib'
import { nextTestSetup } from 'e2e-utils'
import { getHeader, rawRequest } from '../front-server/raw-http'

// What a route.go handler receives, and what its client gets back, under
// `next start`. Every expectation is today's behavior, so the suite passes
// with or without a front server in front of Node, whichever of them ends up
// calling the Go worker.
describe('front-server-go', () => {
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

  describe('what Node answers before the worker', () => {
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
      [201, 'HTTP/1.1 201 Created'],
      [413, 'HTTP/1.1 413 Payload Too Large'],
      [418, "HTTP/1.1 418 I'm a Teapot"],
    ])('writes Node’s reason phrase for %s', async (code, statusLine) => {
      const res = await send(`/go/status/${code}`)
      expect(res.statusLine).toBe(statusLine)
      expect(res.body.toString()).toBe('status')
    })

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

    // TODO: with the front server, a direct request whose worker fails gets
    // a plain 500 instead of Node's error page. Matching Node needs the front
    // to hand the request back and Node to trust that the worker failed,
    // which waits for the token on Node's private listener.
    // @gate !frontServer
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

    it('sends the first chunk of a streaming response before it ends', async () => {
      const first = await firstChunk(Number(next.appPort), '/go/stream')
      expect(first).toBe('first')
    })
  })
})

/** Reads the body's first chunk of a response that never ends, then closes. */
async function firstChunk(port: number, path: string): Promise<string> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const req = http.request({ port, host: '127.0.0.1', path }, (res) => {
      res.once('data', (chunk: Buffer) => {
        res.destroy()
        resolve(chunk.toString())
      })
    })
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
