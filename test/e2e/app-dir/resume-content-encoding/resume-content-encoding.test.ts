import { nextTestSetup, isNextDeploy } from 'e2e-utils'
import { gzip, deflate, brotliCompress } from 'node:zlib'
import { promisify } from 'node:util'

const gzipAsync = promisify(gzip)
const deflateAsync = promisify(deflate)
const brotliCompressAsync = promisify(brotliCompress)

describe('resume-content-encoding', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev || skipped) {
    it.skip('only testable in production', () => {})
    return
  }

  async function getPostponedState() {
    const { postponed } = await next.readJSON('.next/server/app/index.meta')
    expect(postponed).toEqual(expect.any(String))
    expect(postponed.length).toBeGreaterThan(0)
    return postponed as string
  }

  it('should build with postponed state for PPR resume', async () => {
    if (isNextDeploy) return
    await getPostponedState()
  })

  it('should serve both static shell and dynamic content via PPR resume', async () => {
    const response = await next.fetch('/', {
      headers: { cookie: 'demo=test-value' },
    })
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('static shell')
    expect(html).toContain('test-value')
  })

  describe('PPR resume with Content-Encoding', () => {
    async function sendResumeRequest(
      body: BodyInit,
      extraHeaders: Record<string, string>
    ) {
      return fetch(next.url + '/', {
        method: 'POST',
        headers: {
          'next-resume': '1',
          ...extraHeaders,
        },
        body,
      })
    }

    it('should handle uncompressed postponed state (baseline)', async () => {
      const postponed = await getPostponedState()
      const response = await sendResumeRequest(postponed, {
        cookie: 'demo=baseline',
      })
      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('static shell')
      expect(html).toContain('baseline')
    })

    it('should handle gzip-compressed body with Content-Encoding header', async () => {
      const postponed = await getPostponedState()
      const compressed = await gzipAsync(Buffer.from(postponed))

      const response = await sendResumeRequest(compressed, {
        'content-encoding': 'gzip',
        cookie: 'demo=gzip-with-header',
      })

      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('static shell')
      expect(html).toContain('gzip-with-header')
    })

    it('should handle gzip-compressed body without Content-Encoding (magic number detection)', async () => {
      const postponed = await getPostponedState()
      const compressed = await gzipAsync(Buffer.from(postponed))

      const response = await sendResumeRequest(compressed, {
        cookie: 'demo=gzip-magic',
      })

      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('static shell')
      expect(html).toContain('gzip-magic')
    })

    it('should handle deflate-compressed body with Content-Encoding header', async () => {
      const postponed = await getPostponedState()
      const compressed = await deflateAsync(Buffer.from(postponed))

      const response = await sendResumeRequest(compressed, {
        'content-encoding': 'deflate',
        cookie: 'demo=deflate',
      })

      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('static shell')
      expect(html).toContain('deflate')
    })

    it('should handle brotli-compressed body with Content-Encoding header', async () => {
      const postponed = await getPostponedState()
      const compressed = await brotliCompressAsync(Buffer.from(postponed))

      const response = await sendResumeRequest(compressed, {
        'content-encoding': 'br',
        cookie: 'demo=brotli',
      })

      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('static shell')
      expect(html).toContain('brotli')
    })
  })
})
