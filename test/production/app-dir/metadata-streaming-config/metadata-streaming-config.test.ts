import { nextTestSetup } from 'e2e-utils'

describe('app-dir - metadata-streaming-config', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have the default streaming metadata config output in routes-manifest.json', async () => {
    const requiredServerFiles = JSON.parse(
      await next.readFile('.next/required-server-files.json')
    )
    expect(requiredServerFiles.files).toContain(
      '.next/response-config-manifest.json'
    )
    expect(
      requiredServerFiles.config.experimental.htmlLimitedBots
    ).toMatchInlineSnapshot(
      `"Mediapartners-Google|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview"`
    )

    const responseConfigManifest = JSON.parse(
      await next.readFile('.next/response-config-manifest.json')
    )

    expect(responseConfigManifest).toMatchInlineSnapshot(`
     {
       "htmlLimitedBots": "Mediapartners-Google|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview",
       "version": 0,
     }
    `)
  })
})
