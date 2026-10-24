import { load } from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
} from 'next-test-utils'
import { join } from 'node:path'

describe('dynamicParams: false with adapterPath', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it.each(['document', 'head', 'navigation', 'prefetch', 'bot'])(
    'renders the adapter 404 for an unlisted %s request',
    async (kind) => {
      const headers: Record<string, string> = {}
      if (kind === 'navigation' || kind === 'prefetch') headers.RSC = '1'
      if (kind === 'prefetch') headers['Next-Router-Prefetch'] = '1'
      if (kind === 'bot') headers['user-agent'] = 'Googlebot'
      const options = { headers, method: kind === 'head' ? 'HEAD' : 'GET' }
      expect((await next.fetch('/products/known', options)).status).toBe(200)

      const outputStart = next.cliOutput.length
      const response = await next.fetch('/products/unlisted', options)
      expect(response.status).toBe(404)
      const body = await response.text()
      if (kind === 'head') {
        expect(body).toBe('')
      } else {
        expect(body).toContain('Product not found')
        if (!headers.RSC) {
          expect(load(body)('#not-found').text()).toBe('Product not found')
        }
      }
      const output = next.cliOutput.slice(outputStart)
      expect(output).not.toContain('product render unlisted')
      expect(output).not.toContain('cache entry required but not generated')
      expect(output).not.toContain('ERR_HTTP_HEADERS_SENT')
      expect(output).not.toContain('NoFallbackError')
    }
  )

  it.each(['GET', 'HEAD'])(
    'returns a 404 for an unlisted %s request without an adapter 404 renderer',
    async (method) => {
      const port = await findPort()
      const server = await initNextServerScript(
        join(next.testDir, 'server.cjs'),
        /Adapter ready/,
        {
          ...process.env,
          NODE_ENV: 'production',
          PORT: String(port),
          TURBOPACK: process.env.IS_TURBOPACK_TEST ? '1' : '',
        },
        undefined,
        { cwd: next.testDir, shouldRejectOnError: true }
      )

      try {
        const known = await fetchViaHTTP(port, '/products/known', undefined, {
          method,
        })
        expect(known.status).toBe(200)

        const response = await fetchViaHTTP(
          port,
          '/products/unlisted',
          undefined,
          { method }
        )
        expect(response.status).toBe(404)
        expect(await response.text()).toBe(
          method === 'HEAD' ? '' : 'This page could not be found'
        )
      } finally {
        await killApp(server)
      }
    }
  )

  it('regenerates an admitted path after invalidation', async () => {
    const before = await next.render$('/products/known')
    const generation = before('#generation').text()
    expect(generation).not.toBe('')
    expect((await next.fetch('/revalidate', { method: 'POST' })).status).toBe(
      200
    )
    const response = await next.fetch('/products/known')
    expect(response.status).toBe(200)
    const $ = load(await response.text())
    expect($('#slug').text()).toBe('known')
    expect($('#generation').text()).not.toBe(generation)
  })
})
