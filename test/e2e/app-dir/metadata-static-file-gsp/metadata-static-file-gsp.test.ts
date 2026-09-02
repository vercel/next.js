import { nextTestSetup } from 'e2e-utils'

describe('metadata-static-file-gsp', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should build and serve a static metadata file colocated with generateStaticParams', async () => {
    await next.render('/results/two')

    const response = await next.fetch('/results/-/opengraph-image.png')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
  })
})
