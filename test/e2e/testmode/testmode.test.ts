import { nextTestSetup } from 'e2e-utils'
import { createServer, type Server } from 'node:http'
import { gzipSync, gunzipSync } from 'node:zlib'
import { createProxyServer } from 'next/experimental/testmode/proxy'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('testmode', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: require('./package.json').dependencies,
  })

  let proxyServer: Awaited<ReturnType<typeof createProxyServer>>

  beforeEach(async () => {
    proxyServer = await createProxyServer({
      onFetch: async (testData, request) => {
        if (
          request.method === 'GET' &&
          request.url === 'https://example.com/image.png'
        ) {
          return new Response(PNG_1X1, {
            headers: { 'content-type': 'image/png' },
          })
        }
        if (
          request.method === 'GET' &&
          [
            'https://example.com/',
            'https://next-data-api-endpoint.vercel.app/api/random',
          ].includes(request.url)
        ) {
          return new Response(testData)
        }
        if (
          request.method === 'GET' &&
          request.url === 'https://example.com/middleware'
        ) {
          return new Response(`middleware-${testData}`)
        }
        if (new URL(request.url).pathname === '/compressed') {
          if (testData === 'fetch-response') {
            return fetch(request)
          }
          if (testData === 'modified-response') {
            const response = await fetch(request)
            return new Response(`modified:${await response.text()}`, {
              headers: response.headers,
            })
          }
          return 'continue'
        }
        return undefined
      },
    })
  })

  afterEach(async () => {
    proxyServer.close()
  })

  const fetchForTest = async (url: string, testData?: string) => {
    return next.fetch(url, {
      headers: {
        'Next-Test-Proxy-Port': String(proxyServer.port),
        'Next-Test-Data': testData ?? 'test1',
      },
    })
  }

  describe('compressed HTTP responses', () => {
    let upstream: Server
    let upstreamUrl: string
    const cases = [
      { name: 'chunked', plain: '{"ok":true}', withLength: false },
      { name: 'shorter decoded body', plain: '{"ok":true}', withLength: true },
      {
        name: 'longer decoded body',
        plain: 'x'.repeat(2000),
        withLength: true,
      },
    ]

    beforeAll(async () => {
      upstream = createServer((req, res) => {
        const index = Number(
          new URL(req.url!, 'http://localhost').searchParams.get('case')
        )
        const { plain, withLength } = cases[index]
        const body = gzipSync(plain)
        res.setHeader('content-type', 'text/plain')
        res.setHeader('content-encoding', 'gzip')
        if (withLength) res.setHeader('content-length', body.length)
        res.writeHead(200)
        res.end(body)
      })
      await new Promise<void>((resolve) =>
        upstream.listen(0, '127.0.0.1', resolve)
      )
      const address = upstream.address()
      if (!address || typeof address === 'string')
        throw new Error('Missing upstream address')
      upstreamUrl = `http://127.0.0.1:${address.port}/compressed`
    })

    afterAll(async () => {
      upstream.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        upstream.close((error) => (error ? reject(error) : resolve()))
      )
    })

    describe.each(['without test context', 'with proxy continue'])(
      '%s',
      (context) => {
        it.each(cases)('preserves $name', async ({ plain, withLength }) => {
          const index = cases.findIndex(
            (entry) => entry.plain === plain && entry.withLength === withLength
          )
          const url = `/api/compressed-http?url=${encodeURIComponent(`${upstreamUrl}?case=${index}`)}`
          const response =
            context === 'without test context'
              ? await next.fetch(url)
              : await fetchForTest(url)
          expect(response.status).toBe(200)
          const result = await response.json()
          const body = Buffer.from(result.body, 'base64')
          expect(result.headers['content-encoding']).toBe('gzip')
          expect(result.headers['content-length']).toBe(
            withLength ? String(gzipSync(plain).length) : undefined
          )
          expect(body).toEqual(gzipSync(plain))
          expect(gunzipSync(body).toString()).toBe(plain)
        })
      }
    )

    describe.each(['fetch-response', 'modified-response'])(
      'with proxy %s',
      (testData) => {
        it.each(cases)(
          'should forward $name with a decoded body and matching headers',
          async ({ plain, withLength }) => {
            const index = cases.findIndex(
              (entry) =>
                entry.plain === plain && entry.withLength === withLength
            )
            const url = `/api/compressed-http?url=${encodeURIComponent(`${upstreamUrl}?case=${index}`)}`
            const response = await fetchForTest(url, testData)
            expect(response.status).toBe(200)

            const result = await response.json()
            const body = Buffer.from(result.body, 'base64')
            const expected =
              testData === 'modified-response' ? `modified:${plain}` : plain
            expect(body.toString()).toBe(expected)
            expect(result.headers['content-type']).toBe('text/plain')
            expect(result.headers['content-encoding']).toBeUndefined()
            // The interceptor may omit the length, but must not retain a stale one.
            if (result.headers['content-length'] !== undefined) {
              expect(result.headers['content-length']).toBe(
                String(Buffer.byteLength(expected))
              )
            }
          }
        )
      }
    )
  })

  describe('app router', () => {
    it('should fetch real data when Next-Test-* headers are not present', async () => {
      const html = await (await next.fetch('/app/rsc-fetch')).text()
      expect(html).not.toContain('<pre>test1</pre>')
    })

    it('should pass http.get through to the real server when Next-Test-* headers are not present', async () => {
      const html = await (await next.fetch('/app/rsc-httpget')).text()
      expect(html).toContain('Example Domain')
    })

    it('should handle RSC with fetch in serverless function', async () => {
      const html = await (await fetchForTest('/app/rsc-fetch')).text()
      expect(html).toContain('<pre>test1</pre>')
    })

    it('should avoid fetch cache', async () => {
      const html1 = await (await fetchForTest('/app/rsc-fetch')).text()
      expect(html1).toContain('<pre>test1</pre>')

      const html2 = await (await fetchForTest('/app/rsc-fetch', 'test2')).text()
      expect(html2).toContain('<pre>test2</pre>')
    })

    it('should handle RSC with http.get in serverless function', async () => {
      const html = await (await fetchForTest('/app/rsc-httpget')).text()
      expect(html).toContain('<pre>test1</pre>')
    })

    it('should handle RSC with fetch in edge function', async () => {
      const html = await (await fetchForTest('/app/rsc-fetch-edge')).text()
      expect(html).toContain('<pre>test1</pre>')
    })

    it('should handle API with fetch in serverless function', async () => {
      const json = await (await fetchForTest('/api/fetch')).json()
      expect(json.text).toEqual('test1')
    })

    it('should handle API with http.get in serverless function', async () => {
      const json = await (await fetchForTest('/api/httpget')).json()
      expect(json.text).toEqual('test1')
    })

    it('should handle API with fetch in edge function', async () => {
      const json = await (await fetchForTest('/api/fetch-edge')).json()
      expect(json.text).toEqual('test1')
    })
  })

  describe('page router', () => {
    it('should handle getServerSideProps with fetch', async () => {
      const html = await (
        await fetchForTest('/pages/getServerSidePropsFetch')
      ).text()
      expect(html).toContain('<pre>test1</pre>')
    })

    it('should handle getServerSideProps with http.get', async () => {
      const html = await (
        await fetchForTest('/pages/getServerSidePropsHttpGet')
      ).text()
      expect(html).toContain('<pre>test1</pre>')
    })

    it('should handle API with fetch', async () => {
      const json = await (await fetchForTest('/api/pages/fetch')).json()
      expect(json.text).toEqual('test1')
    })

    it('should handle API with http.get', async () => {
      const json = await (await fetchForTest('/api/pages/httpget')).json()
      expect(json.text).toEqual('test1')
    })
  })

  describe('middleware', () => {
    it('should intercept fetchs in middleware', async () => {
      const resp = await fetchForTest('/app/rsc-fetch')
      expect(resp.headers.get('x-middleware-fetch')).toEqual('middleware-test1')
    })
  })

  describe('rewrites', () => {
    it('should handle rewrites', async () => {
      const text = await (await fetchForTest('/rewrite-1')).text()
      expect(text).toEqual('test1')
    })
  })

  describe('image optimizer', () => {
    it('should intercept external image requests', async () => {
      const response = await fetchForTest(
        '/_next/image?url=https%3A%2F%2Fexample.com%2Fimage.png&w=64&q=75'
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toMatch(/^image\//)
    })
  })
})
