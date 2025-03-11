/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'
import { SourceMapPayload } from 'module'

describe('browser-chunks', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  ;(isTurbopack ? it.skip : it)(
    'must not bundle any server modules into browser chunks',
    async () => {
      const sourcemaps = await next.readFiles(
        '.next/static/chunks',
        (filename) => filename.endsWith('.js.map')
      )

      const sources = sourcemaps.flatMap(
        (sourcemap) => (JSON.parse(sourcemap) as SourceMapPayload).sources
      )

      const serverSources = sources.filter(
        (source) =>
          /webpack:\/\/_N_E\/(\.\.\/)*src\/server\//.test(source) ||
          source.includes('next/dist/esm/server') ||
          source.includes('next/dist/server')
      )

      const devOverlaySources = sources.filter((source) => {
        return (
          /webpack:\/\/_N_E\/(\.\.\/)*src\/client\/components\/react-dev-overlay\//.test(
            source
          ) ||
          /next\/dist\/(esm\/)?client\/components\/react-dev-overlay/.test(
            source
          )
        )
      })

      if (serverSources.length > 0) {
        console.error(
          `Found the following server modules:\n  ${serverSources.join('\n  ')}\nIf any of these modules are allowed to be included in browser chunks, move them to src/shared or src/client.`
        )

        throw new Error('Did not expect any server modules in browser chunks.')
      }

      if (devOverlaySources.length > 0) {
        console.error(
          `Found the following dev overlay modules:\n  ${devOverlaySources.join(
            '\n  '
          )}\nIf any of these modules are allowed to be included in production chunks, check the import and render conditions.`
        )

        throw new Error(
          'Did not expect any dev overlay modules in browser chunks.'
        )
      }
    }
  )
})
