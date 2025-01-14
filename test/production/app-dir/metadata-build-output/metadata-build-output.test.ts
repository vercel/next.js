import { nextTestSetup } from 'e2e-utils'

describe('app-dir - metadata-build-output', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should generate route manifest for the metadata routes', async () => {
    const routes = [
      '/favicon.ico',
      '/icon.png',
      '/twitter-image.png',
      '/opengraph-image.png',
      '/manifest.webmanifest',
      '/sitemap.xml',
    ]

    const manifestState = {}
    for (const route of routes) {
      manifestState[route] = await next.hasFile(
        `.next/server/app${route}/route_client-reference-manifest.js`
      )
    }

    expect(manifestState).toEqual(
      Object.fromEntries(routes.map((route) => [route, true]))
    )
  })
})
