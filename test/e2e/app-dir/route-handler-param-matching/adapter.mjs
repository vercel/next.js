import fs from 'node:fs/promises'

/** @type {import('next').NextAdapter} */
export default {
  name: 'route-handler-param-matching',
  async onBuildComplete({ routing, outputs }) {
    const manifest = JSON.parse(
      await fs.readFile('.next/prerender-manifest.json', 'utf8')
    )
    await fs.writeFile(
      'adapter-admission.json',
      JSON.stringify({
        admission: manifest.routeHandlerParamMatching,
        appRoutes: outputs.appRoutes.map(({ pathname }) => pathname),
        prerenders: outputs.prerenders.map(({ pathname, route, config }) => ({
          pathname,
          route,
          allowQuery: config.allowQuery,
        })),
        dynamicRoutes: routing.dynamicRoutes.map(
          ({ source, sourceRegex, destination, has }) => ({
            source,
            sourceRegex,
            destination,
            conditional: Boolean(has?.length),
          })
        ),
      })
    )
  },
}
