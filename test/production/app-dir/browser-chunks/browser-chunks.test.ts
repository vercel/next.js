import { nextTestSetup } from 'e2e-utils'

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

    sources = sourcemaps.flatMap((sourcemap) => JSON.parse(sourcemap).sources)
  })
  it('must not bundle any server modules into browser chunks', () => {
    const serverSources = sources.filter(
      (source) =>
        /webpack:\/\/_N_E\/(\.\.\/)*src\/server\//.test(source) ||
        source.includes('next/dist/esm/server') ||
        source.includes('next/dist/server') ||
        source.includes('next-devtools/server')
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
      return source.includes('next-devtools')
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
