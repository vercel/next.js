import { nextTestSetup } from 'e2e-utils'

describe('app dir - metadata', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have statically optimized metadata routes by default', async () => {
    const prerenderManifest = JSON.parse(
      await next.readFile('.next/prerender-manifest.json')
    )

    for (const key of [
      '/robots.txt',
      '/sitemap.xml',
      '/opengraph-image',
      '/manifest.webmanifest',
    ]) {
      expect(prerenderManifest.routes[key]).toBeTruthy()
      expect(prerenderManifest.routes[key].initialRevalidateSeconds).toBe(false)

      const res = await next.fetch(key)
      expect(res.status).toBe(200)
      expect(res.headers.get('x-nextjs-cache')).toBe('HIT')
    }
  })
})
