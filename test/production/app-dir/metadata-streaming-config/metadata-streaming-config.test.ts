import { nextTestSetup } from 'e2e-utils'

// TODO: remove this env once streaming metadata is available for ppr
process.env.__NEXT_EXPERIMENTAL_PPR = 'true'

describe('app-dir - metadata-streaming-config', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have the default streaming metadata config output in routes-manifest.json', async () => {
    const requiredServerFiles = JSON.parse(
      await next.readFile('.next/required-server-files.json')
    )

    expect(
      requiredServerFiles.config.experimental.htmlLimitedBots
    ).toMatchInlineSnapshot(
      `"Mediapartners-Google|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview"`
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
         "value": "Mediapartners-Google|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview",
       },
     }
    `)
  })
})
