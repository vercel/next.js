import { nextTestSetup } from 'e2e-utils'

describe('app-dir - metadata-streaming-config-customized', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    overrideFiles: {
      'next.config.js': `
        module.exports = {
          htmlLimitedBots: /MyBot/i,
          cacheComponents: true,
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
       "/": {
         "key": "user-agent",
         "type": "header",
         "value": "MyBot",
       },
       "/_global-error": {
         "key": "user-agent",
         "type": "header",
         "value": "MyBot",
       },
       "/_not-found": {
         "key": "user-agent",
         "type": "header",
         "value": "MyBot",
       },
       "/dynamic": {
         "key": "user-agent",
         "type": "header",
         "value": "MyBot",
       },
       "/ppr": {
         "key": "user-agent",
         "type": "header",
         "value": "MyBot",
       },
     }
    `)
  })
})
