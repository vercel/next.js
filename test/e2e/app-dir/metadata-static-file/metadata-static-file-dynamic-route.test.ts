import { nextTestSetup, isNextStart } from 'e2e-utils'
import {
  getCommonMetadataHeadTags,
  readFixtureBuffer,
  readFixtureText,
} from './utils'

describe('metadata-files-static-output-dynamic-route', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
  })

  if (skipped) {
    return
  }

  it('should have correct link tags for dynamic page with static placeholder', async () => {
    const browser = await next.browser('/dynamic/123')

    // Static metadata files under dynamic routes use "-" as placeholder
    // since the file content is the same regardless of params
    expect(await getCommonMetadataHeadTags(browser)).toMatchInlineSnapshot(`
     {
       "links": [
         {
           "href": "/dynamic/-/apple-icon.png",
           "rel": "apple-touch-icon",
           "type": "image/png",
         },
         {
           "href": "/dynamic/-/icon.png",
           "rel": "icon",
           "type": "image/png",
         },
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
           "name": "twitter:card",
         },
         {
           "name": "twitter:image",
         },
         {
           "name": "twitter:image:height",
         },
         {
           "name": "twitter:image:type",
         },
         {
           "name": "twitter:image:width",
         },
         {
           "name": "viewport",
         },
         {
           "property": "og:image",
         },
         {
           "property": "og:image:height",
         },
         {
           "property": "og:image:type",
         },
         {
           "property": "og:image:width",
         },
       ],
     }
    `)
  })

  it('should serve static files when requested with placeholder for dynamic page', async () => {
    // Static metadata files use "-" as placeholder for dynamic segments
    const [
      appleIconRes,
      iconRes,
      opengraphImageRes,
      twitterImageRes,
      sitemapRes,
    ] = await Promise.all([
      next.fetch('/dynamic/-/apple-icon.png'),
      next.fetch('/dynamic/-/icon.png'),
      next.fetch('/dynamic/-/opengraph-image.png'),
      next.fetch('/dynamic/-/twitter-image.png'),
      next.fetch('/dynamic/-/sitemap.xml'),
    ])

    // Compare response content with actual files
    const [
      actualAppleIcon,
      actualIcon,
      actualOpengraphImage,
      actualTwitterImage,
      actualSitemap,
    ] = await Promise.all([
      readFixtureBuffer('app/dynamic/[id]/apple-icon.png'),
      readFixtureBuffer('app/dynamic/[id]/icon.png'),
      readFixtureBuffer('app/dynamic/[id]/opengraph-image.png'),
      readFixtureBuffer('app/dynamic/[id]/twitter-image.png'),
      readFixtureText('app/dynamic/[id]/sitemap.xml'),
    ])

    expect({
      appleIcon: Buffer.compare(
        Buffer.from(await appleIconRes.arrayBuffer()),
        actualAppleIcon
      ),
      icon: Buffer.compare(
        Buffer.from(await iconRes.arrayBuffer()),
        actualIcon
      ),
      opengraphImage: Buffer.compare(
        Buffer.from(await opengraphImageRes.arrayBuffer()),
        actualOpengraphImage
      ),
      twitterImage: Buffer.compare(
        Buffer.from(await twitterImageRes.arrayBuffer()),
        actualTwitterImage
      ),
      sitemap: await sitemapRes.text(),
    }).toEqual({
      // Buffer comparison returns 0 for equal
      appleIcon: 0,
      icon: 0,
      opengraphImage: 0,
      twitterImage: 0,
      sitemap: actualSitemap,
    })
  })

  if (isNextStart) {
    it('should display static metadata files with "-" placeholder in build output', () => {
      // Build output should show normalized paths with "-" for dynamic segments
      expect(next.cliOutput).toContain('/dynamic/-/apple-icon.png')
      expect(next.cliOutput).toContain('/dynamic/-/icon.png')
      expect(next.cliOutput).toContain('/dynamic/-/opengraph-image.png')
      expect(next.cliOutput).toContain('/dynamic/-/twitter-image.png')

      // Should NOT show the dynamic segment pattern in output for static files
      expect(next.cliOutput).not.toMatch(/\/dynamic\/\[id\]\/icon\.png/)
      expect(next.cliOutput).not.toMatch(/\/dynamic\/\[id\]\/apple-icon\.png/)
    })
  }
})
