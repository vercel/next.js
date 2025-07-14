import { nextTestSetup } from 'e2e-utils'

describe('app-dir - metadata-streaming-config', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have the default streaming metadata config output in routes-manifest.json', async () => {
    const requiredServerFiles = JSON.parse(
      await next.readFile('.next/required-server-files.json')
    )

    expect(requiredServerFiles.config.htmlLimitedBots).toMatchInlineSnapshot(
      `"Googlebot|GoogleOther|Mediapartners-Google|AdsBot-Google|googleweblight|Storebot-Google|Google-PageRenderer|Google-InspectionTool|Chrome-Lighthouse|Bingbot|BingPreview|Slurp|DuckDuckBot|baiduspider|yandex|sogou|LinkedInBot|bitlybot|tumblr|vkShare|quora link preview|facebookexternalhit|facebookcatalog|Twitterbot|applebot|redditbot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|ia_archiver|Yeti"`
    )

    const prerenderManifest = JSON.parse(
      await next.readFile('.next/prerender-manifest.json')
    )
    const { routes } = prerenderManifest

    const bypassConfigs = Object.keys(routes)
      // Pick the user-agent bypass config of each route
      .map((route) => [
        route,
        routes[route].experimentalBypassFor?.find(
          (bypassConfig) => bypassConfig.key === 'user-agent'
        ),
      ])
      .filter(([, bypassConfig]) => Boolean(bypassConfig))
      .reduce((acc, [route, bypassConfig]) => {
        acc[route] = bypassConfig
        return acc
      }, {})

    expect(bypassConfigs).toMatchInlineSnapshot(`
     {
       "/ppr": {
         "key": "user-agent",
         "type": "header",
         "value": "Googlebot|GoogleOther|Mediapartners-Google|AdsBot-Google|googleweblight|Storebot-Google|Google-PageRenderer|Google-InspectionTool|Chrome-Lighthouse|Bingbot|BingPreview|Slurp|DuckDuckBot|baiduspider|yandex|sogou|LinkedInBot|bitlybot|tumblr|vkShare|quora link preview|facebookexternalhit|facebookcatalog|Twitterbot|applebot|redditbot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|ia_archiver|Yeti",
       },
     }
    `)
  })
})
