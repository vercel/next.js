import { nextTestSetup } from 'e2e-utils'

describe('app dir - metadata dynamic routes with async deps', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@vercel/og': 'latest',
    },
  })

  it('should render page with og:image meta tag when opengraph-image has async dependencies', async () => {
    const $ = await next.render$('/blog/hello-world')
    const ogImageUrl = $('meta[property="og:image"]').attr('content')
    expect(ogImageUrl).toContain('/blog/hello-world/opengraph-image')
  })

  it('should serve the opengraph-image route as a valid image', async () => {
    const res = await next.fetch('/blog/hello-world/opengraph-image')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
  })
})
