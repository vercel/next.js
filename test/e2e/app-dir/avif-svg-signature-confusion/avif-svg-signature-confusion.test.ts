import { nextTestSetup, isNextDeploy } from 'e2e-utils'

describe('avif-svg-signature-confusion', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('rejects an ordinary SVG when dangerouslyAllowSVG is false', async () => {
    const res = await next.fetch('/_next/image?url=%2Fcontrol&w=256&q=75', {
      headers: { accept: 'image/webp' },
    })
    if (isNextDeploy && process.env.__NEXT_CACHE_COMPONENTS === 'true') {
      // Vercel + cacheComponents serves the SVG as-is instead of rejecting it.
      expect(res.status).toBe(200)
    } else if (isNextDeploy) {
      expect(res.status).toBe(400)
      expect(await res.text()).toContain('INVALID_IMAGE_OPTIMIZE_REQUEST')
    } else {
      expect(res.status).toBe(400)
      expect(await res.text()).toContain('image type is not allowed')
    }
  })

  it('rejects an SVG prefixed with <!--ftypavif-->', async () => {
    const res = await next.fetch('/_next/image?url=%2Fevil&w=256&q=75', {
      headers: { accept: 'image/webp' },
    })
    if (isNextDeploy && process.env.__NEXT_CACHE_COMPONENTS === 'true') {
      // Vercel + cacheComponents serves the SVG as-is.
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('image/svg+xml')
    } else if (isNextDeploy) {
      // Vercel's image CDN labels it image/avif but passes the bytes through unchanged.
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('image/avif')
      expect(await res.text()).toContain('<svg')
    } else {
      expect(res.status).toBe(400)
      expect(await res.text()).toContain('image type is not allowed')
    }
  })
})
