import { nextTestSetup } from 'e2e-utils'
import { getCommonMetadataHeadTags } from './utils'

describe('metadata-files-static-output-root-route', () => {
  if (process.env.__NEXT_CACHE_COMPONENTS) {
    // Cache Components build fails when metadata files are inside a dynamic route.
    //
    // Route "/dynamic/[id]" has a `generateMetadata` that depends on Request data (`cookies()`, etc...)
    // or uncached external data (`fetch(...)`, etc...) when the rest of the route does not.
    // See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
    // Error occurred prerendering page "/dynamic/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
    // Export encountered an error on /dynamic/[id]/page: /dynamic/[id], exiting the build.
    //
    // TODO: Remove this skip when metadata files are supported in dynamic routes for Cache Components.
    it.skip('should skip test for Cache Components', () => {})
    return
  }

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should have correct link tags for root page', async () => {
    const browser = await next.browser('/')

    expect(await getCommonMetadataHeadTags(browser)).toMatchInlineSnapshot(`
     {
       "links": [
         {
           "href": "/favicon.ico",
           "rel": "icon",
           "type": "image/x-icon",
         },
         {
           "href": "/manifest.json",
           "rel": "manifest",
         },
       ],
       "metas": [
         {
           "name": "viewport",
         },
       ],
     }
    `)
  })

  it('should serve static files when requested to its route', async () => {
    const [faviconRes, manifestRes, robotsRes, sitemapRes] = await Promise.all([
      next.fetch('/favicon.ico'),
      next.fetch('/manifest.json'),
      next.fetch('/robots.txt'),
      next.fetch('/sitemap.xml'),
    ])

    // Compare response content with actual files
    const [actualFavicon, actualManifest, actualRobots, actualSitemap] =
      await Promise.all([
        next.readFileBuffer('app/favicon.ico'),
        next.readFile('app/manifest.json'),
        next.readFile('app/robots.txt'),
        next.readFile('app/sitemap.xml'),
      ])

    expect({
      favicon: Buffer.compare(
        Buffer.from(await faviconRes.arrayBuffer()),
        actualFavicon
      ),
      manifest: await manifestRes.text(),
      robots: await robotsRes.text(),
      sitemap: await sitemapRes.text(),
    }).toEqual({
      favicon: 0, // Buffer comparison returns 0 for equal
      manifest: actualManifest,
      robots: actualRobots,
      sitemap: actualSitemap,
    })
  })
})
