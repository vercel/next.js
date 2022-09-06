import { createNext } from 'e2e-utils'
import { findPort, renderViaHTTP } from 'next-test-utils'
import { PROXIED_HEADER_NAME, PROXIED_HEADER_VALUE } from './constants'
import http from 'http'
import { NextInstance } from 'test/lib/next-modes/base'

const buildRewriteFunction = (port: number) => async () => {
  return {
    fallback: [
      {
        source: '/:path*',
        destination: `http://localhost:${port}'/:path*`,
      },
    ],
    afterFiles: [],
    beforeFiles: [],
  }
}

describe('upstream proxy custom configuration', () => {
  it('uses proxy settings from next config to connect to upstream', async () => {
    const upstream = new http.Server((req, res) => {
      res.writeHead(200)
      res.end(req.headers[PROXIED_HEADER_NAME])
    })
    const port = await findPort()
    upstream.listen(port)

    const next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() { 
            return <p>hello world</p>
          } 
        `,
      },
      nextConfig: {
        experimental: {
          upstreamHttpProxyConfig: {
            headers: { [PROXIED_HEADER_NAME]: PROXIED_HEADER_VALUE },
          },
        },
        async rewrites() {
          return {
            fallback: [
              {
                source: '/:path*',
                destination: `http://localhost:${process.env.UPSTREAM_PORT}/:path*`,
              },
            ],
            afterFiles: [],
            beforeFiles: [],
          }
        },
      },
      env: { UPSTREAM_PORT: String(port) },
    })
    const html = await renderViaHTTP(next.url, '/foo')
    expect(html).toEqual(PROXIED_HEADER_VALUE)

    next.destroy()
    upstream.close()
  })
})
