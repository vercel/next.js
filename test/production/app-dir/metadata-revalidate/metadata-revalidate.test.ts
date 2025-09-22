import { nextTestSetup } from 'e2e-utils'
import { getDistDir } from 'next-test-utils'

describe('app-dir - metadata-revalidate', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should contain the routes in prerender manifest', async () => {
    const manifestContent = await next.readFile(
      getDistDir() + '/prerender-manifest.json'
    )
    const prerenderManifest = JSON.parse(manifestContent)

    expect(
      prerenderManifest.routes['/revalidate/og/opengraph-image']
        .initialRevalidateSeconds
    ).toBe(5)
    expect(
      prerenderManifest.routes['/manifest.webmanifest'].initialRevalidateSeconds
    ).toBe(5)
    expect(
      prerenderManifest.routes['/robots.txt'].initialRevalidateSeconds
    ).toBe(5)
    expect(
      prerenderManifest.routes['/sitemap.xml'].initialRevalidateSeconds
    ).toBe(5)
  })
})
