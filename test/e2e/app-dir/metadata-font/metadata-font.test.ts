import { nextTestSetup } from 'e2e-utils'

describe('app dir - metadata font', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should handle custom fonts in both edge and nodejs runtime', async () => {
    const resOgEdge = await next.fetch('/font/opengraph-image')
    const resOgNodejs = await next.fetch('/font/opengraph-image2')

    expect(resOgEdge.status).toBe(200)
    expect(resOgEdge.headers.get('content-type')).toBe('image/png')
    expect(resOgNodejs.status).toBe(200)
    expect(resOgNodejs.headers.get('content-type')).toBe('image/png')
  })
})
