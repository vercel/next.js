import { load } from 'cheerio'
import { nextTestSetup } from 'e2e-utils'

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
