import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { expectWidth, setupTests } from './util'

// Deployments use the Vercel image CDN instead of the local image pipeline.
// @force-gate !deploy
describe('with experimental.imgOptSafeMode', () => {
  // AVIF output isn't supported, so the shared AVIF tests don't apply.
  setupTests({
    nextConfigImages: { formats: ['image/webp'] },
    nextConfigExperimental: { imgOptSafeMode: true },
  })

  describe('with only AVIF in images.formats', () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'app'),
      nextConfig: {
        images: { formats: ['image/avif'] },
        // `nextImage` defaults to `true` in the object form
        experimental: { imgOptSafeMode: {} },
      },
    })

    it('should ignore avif and keep the source format', async () => {
      const res = await next.fetch('/_next/image?url=/test.png&w=384&q=75', {
        headers: {
          accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('image/png')
      expect(res.headers.get('Content-Disposition')).toBe(
        'attachment; filename="test.png"'
      )
      await expectWidth(res, 384)
      expect(next.cliOutput).toContain(
        'Some "images.formats" are ignored when using "experimental.imgOptSafeMode": image/avif'
      )
    })
  })
})
