import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

describe.each([{ generateEtags: true }, { generateEtags: false }])(
  'with generateEtags: $generateEtags',
  ({ generateEtags }) => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'app'),
      nextConfig: { generateEtags },
      // Vercel's deploy serves images through its own image CDN with different
      // headers, so these assertions don't apply.
      skipDeployment: true,
    })

    const imageUrl = '/_next/image?url=%2Ftest.png&w=64&q=75'

    if (generateEtags) {
      it('should send an ETag and respond with 304 when it matches', async () => {
        const res1 = await next.fetch(imageUrl, {
          headers: { accept: 'image/webp' },
        })
        expect(res1.status).toBe(200)
        expect(res1.headers.get('content-type')).toBe('image/webp')
        const etag = res1.headers.get('etag')
        expect(etag).toBeTruthy()

        // undici injects Cache-Control: no-cache into requests with
        // conditional headers, which would defeat the etag freshness check.
        const res2 = await next.fetch(imageUrl, {
          headers: { accept: 'image/webp', 'if-none-match': etag },
          cache: 'force-cache',
        })
        expect(res2.status).toBe(304)
        expect(res2.headers.get('etag')).toBe(etag)
        expect((await res2.arrayBuffer()).byteLength).toBe(0)
      })
    } else {
      it('should not send an ETag or respond with 304', async () => {
        const res1 = await next.fetch(imageUrl, {
          headers: { accept: 'image/webp' },
        })
        expect(res1.status).toBe(200)
        expect(res1.headers.get('content-type')).toBe('image/webp')
        expect(res1.headers.get('etag')).toBeNull()

        // Even a cached (HIT) response must not carry an ETag, and a
        // conditional request must be answered with the full image.
        const res2 = await next.fetch(imageUrl, {
          headers: { accept: 'image/webp', 'if-none-match': '*' },
          cache: 'force-cache',
        })
        expect(res2.status).toBe(200)
        expect(res2.headers.get('etag')).toBeNull()
        expect((await res2.arrayBuffer()).byteLength).toBeGreaterThan(0)
      })
    }
  }
)
