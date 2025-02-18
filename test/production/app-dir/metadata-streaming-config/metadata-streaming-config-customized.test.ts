import { nextTestSetup } from 'e2e-utils'

// TODO: remove this env once streaming metadata is available for ppr
process.env.__NEXT_EXPERIMENTAL_PPR = 'true'

describe('app-dir - metadata-streaming-config-customized', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    overrideFiles: {
      'next.config.js': `
        module.exports = {
          experimental: {
            ppr: 'incremental',
            streamingMetadata: true,
            htmlLimitedBots: /MyBot/i,
          }
        }
      `,
    },
  })

  it('should have the customized streaming metadata config output in routes-manifest.json', async () => {
    const prerenderManifest = JSON.parse(
      await next.readFile('.next/prerender-manifest.json')
    )
    const { routes } = prerenderManifest

    const bypassConfigs = Object.keys(routes)
      .map((route) => [route, routes[route].experimentalBypassFor?.[2]])
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
         "value": "MyBot",
       },
     }
    `)
  })
})
