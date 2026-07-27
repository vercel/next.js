import { nextTestSetup } from 'e2e-utils'
import {
  getCommonMetadataHeadTags,
  readFixtureBuffer,
  readFixtureText,
} from './utils'

describe('metadata-files-static-output-group-route', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
  })

  if (skipped) {
    return
  }

  it('should have correct link tags for group page', async () => {
    const browser = await next.browser('/group')

    expect(await getCommonMetadataHeadTags(browser)).toMatchInlineSnapshot(`
     {
       "links": [
         {
           "href": "/favicon.ico",
           "rel": "icon",
           "type": "image/x-icon",
         },
         {
           "href": "/group/apple-icon-131tc6.png",
           "rel": "apple-touch-icon",
           "type": "image/png",
         },
         {
           "href": "/group/icon-131tc6.png",
           "rel": "icon",
           "type": "image/png",
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

  it('should serve static files when requested to its route for group page', async () => {
    const [
      appleIconRes,
      iconRes,
      opengraphImageRes,
      twitterImageRes,
      sitemapRes,
    ] = await Promise.all([
      next.fetch('/group/apple-icon-131tc6.png'),
      next.fetch('/group/icon-131tc6.png'),
      next.fetch('/group/opengraph-image-131tc6.png'),
      next.fetch('/group/twitter-image-131tc6.png'),
      next.fetch('/group/sitemap.xml'),
    ])

    // Compare response content with actual files
    const [
      actualAppleIcon,
      actualIcon,
      actualOpengraphImage,
      actualTwitterImage,
      actualSitemap,
    ] = await Promise.all([
      readFixtureBuffer('app/(group)/group/apple-icon.png'),
      readFixtureBuffer('app/(group)/group/icon.png'),
      readFixtureBuffer('app/(group)/group/opengraph-image.png'),
      readFixtureBuffer('app/(group)/group/twitter-image.png'),
      readFixtureText('app/(group)/group/sitemap.xml'),
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
})
