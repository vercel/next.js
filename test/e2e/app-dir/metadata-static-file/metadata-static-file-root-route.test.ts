import { nextTestSetup } from 'e2e-utils'
import { getCommonMetadataHeadTags } from './utils'

describe('metadata-files-static-output-root-route', () => {
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
