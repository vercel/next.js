import { nextTestSetup } from 'e2e-utils'

describe('app-dir absolute assetPrefix', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      assetPrefix: 'https://example.vercel.sh/custom-asset-prefix',
    },
  })

  it('bundles should return 200 on served assetPrefix', async () => {
    const $ = await next.render$('/')

    let bundles = []
    for (const script of $('script').toArray()) {
      const { src } = script.attribs
      if (
        src?.includes(
          'https://example.vercel.sh/custom-asset-prefix/_next/static'
        )
      ) {
        bundles.push(src)
      }
    }

    expect(bundles.length).toBeGreaterThan(0)

    for (const src of bundles) {
      // Remove hostname to check if pathname is still used for serving the bundles
      const bundlePathWithoutHost = decodeURI(new URL(src).pathname)
      const { status } = await next.fetch(bundlePathWithoutHost)

      expect(status).toBe(200)
    }
  })
})
