import { writeFile } from 'node:fs/promises'

export default {
  name: 'capture-param-matching-query-contract',
  async onBuildComplete({ outputs, routing }) {
    // Capture only the public query-key contract, not bypass tokens or build
    // paths. The behavioral tests also run without access to these artifacts.
    await writeFile(
      'query-contract.json',
      JSON.stringify({
        prerenders: outputs.prerenders.map(
          ({ pathname, config, fallback }) => ({
            pathname,
            allowQuery: config.allowQuery,
            hasFallback: fallback?.filePath !== undefined,
          })
        ),
        routes: routing.dynamicRoutes.map(({ source, destination }) => ({
          source,
          destination,
        })),
      })
    )
  },
}
