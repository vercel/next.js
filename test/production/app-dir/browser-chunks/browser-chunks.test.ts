import { nextTestSetup } from 'e2e-utils'
import { SourceMapPayload } from 'module'

describe('browser-chunks', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  let sources = []
  beforeAll(async () => {
    const sourcemaps = await next.readFiles('.next/static/chunks', (filename) =>
      filename.endsWith('.js.map')
    )

    sources = sourcemaps.flatMap(
      (sourcemap) => (JSON.parse(sourcemap) as SourceMapPayload).sources
    )
  })
  it('must not bundle any server modules into browser chunks', () => {
    const serverSources = sources.filter(
      (source) =>
        /webpack:\/\/_N_E\/(\.\.\/)*src\/server\//.test(source) ||
        source.includes('next/dist/esm/server') ||
        source.includes('next/dist/server')
    )

    if (serverSources.length > 0) {
      console.error(
        `Found the following server modules:\n  ${serverSources.join('\n  ')}\nIf any of these modules are allowed to be included in browser chunks, move them to src/shared or src/client.`
      )

      throw new Error('Did not expect any server modules in browser chunks.')
    }
  })

  it('must not bundle any dev overlay into browser chunks', () => {
    const devOverlaySources = sources.filter((source) => {
      return (
        (/webpack:\/\/_N_E\/(\.\.\/)*src\/client\/components\/react-dev-overlay\//.test(
          source
        ) ||
          /next\/dist\/(esm\/)?client\/components\/react-dev-overlay/.test(
            source
          )) &&
        !(
          // This is not dev-overlay frontend code.
          // TODO: Move code into dedicated folder to make distinction clearer.
          (
            source.endsWith(
              'client/components/react-dev-overlay/app/errors/use-error-handler.ts'
            ) ||
            source.endsWith(
              'client/components/react-dev-overlay/app/errors/stitched-error.ts'
            ) ||
            source.endsWith(
              'client/components/react-dev-overlay/app/app-dev-overlay-setup.ts'
            ) ||
            source.endsWith(
              'client/components/react-dev-overlay/app/errors/console-error.ts'
            ) ||
            source.endsWith(
              'client/components/react-dev-overlay/app/errors/intercept-console-error.ts'
            )
          )
        )
      )
    })

    if (devOverlaySources.length > 0) {
      const message = `Found the following dev overlay modules:\n  ${devOverlaySources.join('\n')}`
      console.error(
        `${message}\nIf any of these modules are allowed to be included in production chunks, check the import and render conditions.`
      )

      throw new Error(
        'Did not expect any dev overlay modules in browser chunks.\n' + message
      )
    }
  })
})
