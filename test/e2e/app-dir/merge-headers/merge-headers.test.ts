import { nextTestSetup } from 'e2e-utils'

describe('merge-headers', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should correctly merge nextjs headers with custom headers from middleware', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-link')).toBe(
      '<https://example.com>; rel="alternate"; hreflang="x-default"'
    )
    expect(res.headers.get('link')).toContain(
      '<https://example.com>; rel="alternate"; hreflang="x-default"'
    )
    expect(res.headers.get('link')).toContain(
      '</_next/image?url=%2Ftest.jpg&w=1080&q=75>; rel=preload; as="image"'
    )
  })
})
