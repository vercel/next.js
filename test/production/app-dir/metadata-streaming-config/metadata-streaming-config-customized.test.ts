import { nextTestSetup } from 'e2e-utils'

// TODO: the incremental option has been removed, update to use cacheComponents
describe.skip('app-dir - metadata-streaming-config-customized', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    overrideFiles: {
      'next.config.js': `
        module.exports = {
          htmlLimitedBots: /MyBot/i,
            experimental: {
            ppr: 'incremental',
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
