import { nextTestSetup } from 'e2e-utils'
import { getCommonMetadataHeadTags } from './utils'

describe('metadata-files-static-output-intercepting-route', () => {
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

  it('should have correct link tags for intercepting page', async () => {
    const browser = await next.browser('/intercepting')

    // Click the link to navigate to the intercepted route
    await browser.elementByCss('a[href="/intercept-me"]').click()
    await browser.waitForCondition(
      'window.location.pathname === "/intercept-me"'
    )

    expect(await getCommonMetadataHeadTags(browser)).toMatchInlineSnapshot(`
     {
       "links": [
         {
           "href": "/favicon.ico",
           "rel": "icon",
           "type": "image/x-icon",
         },
         {
           "href": "/intercepting/(..)intercept-me/apple-icon.png",
           "rel": "apple-touch-icon",
           "type": "image/png",
         },
         {
           "href": "/intercepting/(..)intercept-me/icon.png",
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

  it('should serve static files when requested to its route for intercepting page', async () => {
    const [
      appleIconRes,
      iconRes,
      opengraphImageRes,
      twitterImageRes,
      sitemapRes,
    ] = await Promise.all([
      next.fetch(`/intercepting/(..)intercept-me/apple-icon.png`),
      next.fetch(`/intercepting/(..)intercept-me/icon.png`),
      next.fetch(`/intercepting/(..)intercept-me/opengraph-image.png`),
      next.fetch(`/intercepting/(..)intercept-me/twitter-image.png`),
      next.fetch('/intercepting/(..)intercept-me/sitemap.xml'),
    ])

    // Compare response content with actual files
    const [
      actualAppleIcon,
      actualIcon,
      actualOpengraphImage,
      actualTwitterImage,
      actualSitemap,
    ] = await Promise.all([
      next.readFileBuffer('app/intercepting/(..)intercept-me/apple-icon.png'),
      next.readFileBuffer('app/intercepting/(..)intercept-me/icon.png'),
      next.readFileBuffer(
        'app/intercepting/(..)intercept-me/opengraph-image.png'
      ),
      next.readFileBuffer(
        'app/intercepting/(..)intercept-me/twitter-image.png'
      ),
      next.readFile('app/intercepting/(..)intercept-me/sitemap.xml'),
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
