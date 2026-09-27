import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-dir-export - catch-all routes', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname + '/..',
    skipStart: true,
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    it('should skip in dev mode', () => {})
    return
  }

  beforeAll(async () => {
    await next.start()
  })

  it('should generate static pages for catch-all routes', async () => {
    const res1 = await next.fetch('/blog/post-1')
    expect(res1.status).toBe(200)
    const html1 = await res1.text()
    expect(html1).toContain('Blog Post: post-1')

    const res2 = await next.fetch('/blog/category/post-3')
    expect(res2.status).toBe(200)
    const html2 = await res2.text()
    expect(html2).toContain('Blog Post: category/post-3')
  })

  it('should generate opengraph images for catch-all routes', async () => {
    await retry(async () => {
      const res = await next.fetch('/blog/post-1/opengraph-image')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/png')
    })

    await retry(async () => {
      const res = await next.fetch('/blog/category/post-3/opengraph-image')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/png')
    })
  })

  it('should include opengraph meta tags', async () => {
    const html = await next.render('/blog/post-1')
    expect(html).toContain('<meta property="og:image"')
    expect(html).toContain('/blog/post-1/opengraph-image')
  })
})
