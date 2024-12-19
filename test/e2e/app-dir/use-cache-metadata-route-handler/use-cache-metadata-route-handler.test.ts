import { nextTestSetup } from 'e2e-utils'

describe('use-cache-metadata-route-handler', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should generate an opengraph image with a metadata route handler that uses "use cache"', async () => {
    const res = await next.fetch('/opengraph-image')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
  })
})
