/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import sizeOf from 'image-size'

// https://github.com/vercel/next.js/issues/98237
describe('image-optimizer internal redirect', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // The image optimizer route is replaced by Vercel's image CDN when
    // deployed, so this only asserts the local Next.js image pipeline.
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  function fetchOptimizedImage(src: string) {
    const query = new URLSearchParams({ url: src, w: '128', q: '75' })
    return next.fetch(`/_next/image?${query}`, {
      headers: { accept: 'image/webp' },
    })
  }

  it('should follow a relative redirect from a relative image src', async () => {
    const res = await fetchOptimizedImage('/redirect-relative')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/webp')

    const buffer = Buffer.from(await res.arrayBuffer())
    expect(sizeOf(buffer).width).toBe(128)
  })

  it('should follow an absolute redirect to an allowed remote pattern from a relative image src', async () => {
    const res = await fetchOptimizedImage('/redirect-absolute')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/webp')

    const buffer = Buffer.from(await res.arrayBuffer())
    expect(sizeOf(buffer).width).toBe(128)
  })
})
