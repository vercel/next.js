import { nextTestSetup } from 'e2e-utils'

describe('00-middleware', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('should handle middleware correctly', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)

    const html = await res.text()
    expect(html).toContain('Hello from middleware')

    if (isNextDeploy) {
      // Check deployment-specific headers that might be set by middleware
      const middlewareHeader = res.headers.get('x-middleware-applied')
      if (middlewareHeader) {
        expect(middlewareHeader).toBe('true')
      }
    }
  })

  it('should handle middleware with rewrites', async () => {
    const res = await next.fetch('/rewrite-me')
    expect(res.status).toBe(200)

    const html = await res.text()
    expect(html).toContain('This was rewritten')

    if (isNextDeploy) {
      // Check that the middleware properly handled the rewrite
      expect(res.headers.get('x-matched-path')).toBe('/rewritten')
    }
  })

  it('should handle middleware redirects', async () => {
    const res = await next.fetch('/redirect-me', { redirect: 'manual' })
    expect(res.status).toBe(307)

    const location = res.headers.get('location')
    expect(location).toContain('/redirected')

    if (isNextDeploy) {
      // Check deployment-specific redirect headers
      expect(res.headers.get('x-vercel-cache')).toBe('MISS')
    }
  })

  it('should handle middleware with dynamic routes', async () => {
    const res = await next.fetch('/dynamic/test-slug')
    expect(res.status).toBe(200)

    const html = await res.text()
    expect(html).toContain('slug: test-slug')

    if (isNextDeploy) {
      expect(res.headers.get('x-matched-path')).toBe('/dynamic/[slug]')
    }
  })
})
